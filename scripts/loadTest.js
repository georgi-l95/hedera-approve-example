import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from "node:perf_hooks";
import {
    Hbar,
    TransferTransaction,
} from "@hashgraph/sdk";
import readline from "node:readline";
import { Utils } from "./utils.js";

dotenv.config();

const DEFAULT_CONFIG = {
    accountPoolSize: 10,
    accountInitialBalanceHbar: 10,
    transferAmountHbarRange: [0.0001, 0.001],
    stages: [
        { tps: 10, durationSeconds: 120 },
        { tps: 20, durationSeconds: 120 },
        { tps: 50, durationSeconds: 120 },
        { tps: 100, durationSeconds: 120 },
        { tps: 250, durationSeconds: 120 },
        { tps: 500, durationSeconds: 120 },
    ],
};

async function main() {
    validateEnv();

    const config = await loadConfig();
    const client = Utils.initClient();
    const wallet = Utils.initWallet(
        process.env.OPERATOR_ID,
        process.env.OPERATOR_KEY,
        client
    );

    console.log("Preparing account pool...");
    const accounts = await createAccountPool(
        wallet,
        client,
        config.accountPoolSize,
        config.accountInitialBalanceHbar
    );

    const context = {
        wallet,
        accounts,
        config,
    };

    console.log(
        `Account pool ready with ${accounts.length} funded accounts. Starting scenario.`
    );

    const operations = buildOperations(context);
    const stageMetrics = [];

    for (let index = 0; index < config.stages.length; index += 1) {
        const stage = config.stages[index];
        console.log(
            `\nStage ${index + 1}/${config.stages.length}: ${stage.tps} TPS for ${
                stage.durationSeconds
            }s`
        );
        const metrics = initStageMetrics(stage, index, config.stages.length);
        stageMetrics.push(metrics);
        await runStage(stage, context, operations, metrics);
        printStageSummary(metrics);
    }

    printScenarioSummary(stageMetrics);
}

function validateEnv() {
    if (process.env.OPERATOR_ID == null || process.env.OPERATOR_KEY == null) {
        throw new Error(
            "Environment variables OPERATOR_ID and OPERATOR_KEY are required."
        );
    }
}

async function loadConfig() {
    const [, , providedPath] = process.argv;

    if (!providedPath) {
        return DEFAULT_CONFIG;
    }

    const resolvedPath = resolvePathRelativeToModule(
        providedPath,
        import.meta.url
    );

    const buffer = await fs.promises.readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(buffer);

    return {
        ...DEFAULT_CONFIG,
        ...parsed,
        stages: parsed.stages ?? DEFAULT_CONFIG.stages,
    };
}

function resolvePathRelativeToModule(relativePath, moduleUrl) {
    if (path.isAbsolute(relativePath)) {
        return relativePath;
    }
    const moduleDir = path.dirname(fileURLToPath(moduleUrl));
    return path.join(moduleDir, relativePath);
}

async function createAccountPool(wallet, client, size, initialBalanceHbar) {
    const accounts = [];
    for (let i = 0; i < size; i += 1) {
        const account = await Utils.createAccount(wallet, initialBalanceHbar);
        const signer = Utils.initWallet(
            account.accountId,
            account.accountKey,
            client
        );
        accounts.push({
            label: `account-${i}`,
            ...account,
            signer,
        });
    }
    return accounts;
}

function buildOperations(context) {
    const { config } = context;
    return [
        {
            type: "HBAR_TRANSFER",
            weight: 1,
            handler: () => executeHbarTransfer(context, config),
        },
    ];
}

async function executeHbarTransfer(context, config) {
    const { wallet, accounts } = context;
    const [sender, receiver] = pickDistinctAccounts(accounts);
    const amount = pickTransferAmount(config.transferAmountHbarRange);
    const amountHbar = new Hbar(amount);

    let transaction = await new TransferTransaction()
        .addHbarTransfer(sender.accountId, amountHbar.negated())
        .addHbarTransfer(receiver.accountId, amountHbar)
        .freezeWithSigner(sender.signer);

    transaction = await transaction.signWithSigner(sender.signer);

    const submitAt = performance.now();

    const response = await transaction.executeWithSigner(sender.signer);
    const receipt = await response.getReceiptWithSigner(sender.signer);

    const completedAt = performance.now();
    const latencyMs = completedAt - submitAt;

    return {
        type: "HBAR_TRANSFER",
        status: receipt.status.toString(),
        latencyMs,
    };
}

function pickDistinctAccounts(accounts) {
    if (accounts.length < 2) {
        throw new Error("At least two accounts are required for transfers.");
    }
    const senderIndex = Math.floor(Math.random() * accounts.length);
    let receiverIndex = Math.floor(Math.random() * (accounts.length - 1));
    if (receiverIndex >= senderIndex) {
        receiverIndex += 1;
    }
    return [accounts[senderIndex], accounts[receiverIndex]];
}

function pickTransferAmount([min, max]) {
    const value = min + Math.random() * (max - min);
    return Number(value.toFixed(8));
}

async function runStage(stage, context, operations, metrics) {
    const totalTransactions = Math.floor(stage.tps * stage.durationSeconds);
    const intervalMs = stage.tps > 0 ? 1000 / stage.tps : 0;

    metrics.startedAt = performance.now();
    metrics.totalTransactions = totalTransactions;

    const progressTimer = startStageProgress(metrics);

    await new Promise((resolve) => {
        let completed = 0;

        if (totalTransactions === 0) {
            resolve();
            return;
        }

        for (let i = 0; i < totalTransactions; i += 1) {
            const delayMs = Math.round(i * intervalMs);
            setTimeout(async () => {
                try {
                    await executeScheduledOperation(context, operations, metrics);
                } catch (error) {
                    console.error("Unhandled error executing operation:", error);
                } finally {
                    completed += 1;
                    if (completed === totalTransactions) {
                        resolve();
                    }
                }
            }, delayMs);
        }
    });

    metrics.completedAt = performance.now();

    if (progressTimer) {
        clearInterval(progressTimer);
        renderStageProgress(metrics);
        finishStageProgress();
    }
}

async function executeScheduledOperation(context, operations, metrics) {
    const operation = pickOperation(operations);
    metrics.submitted += 1;
    const typeMetrics = metrics.perType[operation.type] ?? initPerTypeMetrics();
    metrics.perType[operation.type] = typeMetrics;
    typeMetrics.submitted += 1;

    const startedAt = performance.now();

    try {
        const result = await operation.handler();
        const latency = result.latencyMs ?? performance.now() - startedAt;

        metrics.success += 1;
        typeMetrics.success += 1;
        if (result?.status != null) {
            metrics.statusCounts[result.status] =
                (metrics.statusCounts[result.status] ?? 0) + 1;
        }
        updateLatency(metrics, latency);
        updateLatency(typeMetrics, latency);
    } catch (error) {
        const latency = performance.now() - startedAt;
        metrics.failures += 1;
        typeMetrics.failures += 1;
        updateLatency(metrics, latency);
        updateLatency(typeMetrics, latency);

        const errorKey = extractErrorKey(error);
        metrics.errors[errorKey] = (metrics.errors[errorKey] ?? 0) + 1;
    }
}

function pickOperation(operations) {
    const totalWeight = operations.reduce(
        (acc, current) => acc + current.weight,
        0
    );
    const target = Math.random() * totalWeight;

    let cumulative = 0;
    for (const operation of operations) {
        cumulative += operation.weight;
        if (target <= cumulative) {
            return operation;
        }
    }

    return operations[operations.length - 1];
}

function initStageMetrics(stage, index, stageCount) {
    return {
        stageIndex: index,
        stageCount,
        stage,
        submitted: 0,
        success: 0,
        failures: 0,
        statusCounts: {},
        latency: {
            min: Number.POSITIVE_INFINITY,
            max: 0,
            total: 0,
            samples: 0,
        },
        perType: {},
        errors: {},
        startedAt: null,
        completedAt: null,
        totalTransactions: 0,
    };
}

function initPerTypeMetrics() {
    return {
        submitted: 0,
        success: 0,
        failures: 0,
        latency: {
            min: Number.POSITIVE_INFINITY,
            max: 0,
            total: 0,
            samples: 0,
        },
    };
}

function updateLatency(target, latency) {
    target.latency.min = Math.min(target.latency.min, latency);
    target.latency.max = Math.max(target.latency.max, latency);
    target.latency.total += latency;
    target.latency.samples += 1;
}

function extractErrorKey(error) {
    if (error?.status != null) {
        return error.status.toString();
    }
    if (error?.message != null) {
        return error.message.split("\n")[0];
    }
    return "UNKNOWN_ERROR";
}

function startStageProgress(metrics) {
    if (!process.stdout.isTTY || (metrics.totalTransactions ?? 0) === 0) {
        return null;
    }
    renderStageProgress(metrics);
    return setInterval(() => renderStageProgress(metrics), 500);
}

function renderStageProgress(metrics) {
    if (!process.stdout.isTTY) {
        return;
    }

    const total = metrics.totalTransactions ?? 0;
    const processed = metrics.success + metrics.failures;
    const percent =
        total > 0 ? Math.min((processed / total) * 100, 100) : 100;
    const pending = Math.max(metrics.submitted - processed, 0);

    const elapsedMs = metrics.startedAt
        ? performance.now() - metrics.startedAt
        : 0;
    const elapsedSeconds = elapsedMs / 1000;
    const rate = elapsedSeconds > 0 ? processed / elapsedSeconds : 0;

    let etaSeconds = 0;
    if (metrics.stage?.durationSeconds != null) {
        etaSeconds = Math.max(
            metrics.stage.durationSeconds - elapsedSeconds,
            0
        );
    } else if (metrics.stage?.tps > 0) {
        const remaining = Math.max(total - processed, 0);
        etaSeconds = remaining / metrics.stage.tps;
    }

    const stageCount = metrics.stageCount || "?";

    const line = [
        `Stage ${metrics.stageIndex + 1}/${stageCount}`,
        `${processed}/${total} (${percent.toFixed(1)}%)`,
        `succ ${metrics.success}`,
        `fail ${metrics.failures}`,
        `in-flight ${pending}`,
        `rate ${rate.toFixed(1)} tx/s`,
        `eta ${etaSeconds.toFixed(0)}s`,
    ].join(" | ");

    clearProgressLine();
    process.stdout.write(line);
}

function finishStageProgress() {
    if (!process.stdout.isTTY) {
        return;
    }
    clearProgressLine();
    process.stdout.write("\n");
}

function clearProgressLine() {
    if (!process.stdout.isTTY) {
        return;
    }
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
}

function printStageSummary(metrics) {
    const { stage, latency, success, failures, submitted } = metrics;
    const avgLatency =
        latency.samples > 0 ? latency.total / latency.samples : 0;
    const minLatency =
        latency.samples > 0 ? latency.min.toFixed(2) : "n/a";
    const maxLatency =
        latency.samples > 0 ? latency.max.toFixed(2) : "n/a";
    const processed = success + failures;
    const durationSeconds =
        metrics.completedAt && metrics.startedAt
            ? (metrics.completedAt - metrics.startedAt) / 1000
            : stage.durationSeconds ?? 0;
    const actualRate =
        durationSeconds > 0 ? processed / durationSeconds : 0;

    console.log(
        `Stage ${metrics.stageIndex + 1}: submitted=${submitted}, success=${success}, failures=${failures}`
    );
    console.log(
        `  Latency (ms): avg=${avgLatency.toFixed(2)}, min=${minLatency}, max=${maxLatency}`
    );
    console.log(
        `  Throughput: target=${stage.tps} TPS, actual=${actualRate.toFixed(
            1
        )} TPS over ${durationSeconds.toFixed(1)}s`
    );

    if (Object.keys(metrics.errors).length > 0) {
        console.log("  Errors:");
        for (const [code, count] of Object.entries(metrics.errors)) {
            console.log(`    ${code}: ${count}`);
        }
    }

    if (Object.keys(metrics.statusCounts).length > 0) {
        console.log("  Statuses:");
        for (const [status, count] of Object.entries(metrics.statusCounts)) {
            console.log(`    ${status}: ${count}`);
        }
    }

    console.log("  Breakdown:");
    for (const [type, values] of Object.entries(metrics.perType)) {
        const typeAvg =
            values.latency.samples > 0
                ? values.latency.total / values.latency.samples
                : 0;
        console.log(
            `    ${type}: submitted=${values.submitted}, success=${values.success}, failures=${values.failures}, avgLatency=${typeAvg.toFixed(
                2
            )}ms`
        );
    }
}

function printScenarioSummary(stageMetrics) {
    const totals = stageMetrics.reduce(
        (acc, metrics) => {
            acc.submitted += metrics.submitted;
            acc.success += metrics.success;
            acc.failures += metrics.failures;
            return acc;
        },
        { submitted: 0, success: 0, failures: 0 }
    );

    console.log("\nScenario complete.");
    console.log(
        `Total submitted=${totals.submitted}, success=${totals.success}, failures=${totals.failures}`
    );
}

main().catch((error) => {
    console.error("Load test aborted:", error);
    process.exit(1);
});
