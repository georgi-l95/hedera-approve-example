//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract Reward {
    event Claim(address indexed user, uint256 amount);

    function claim(address token) public returns (uint256 amount) {
        amount = 1;

        IERC20(token).transfer(msg.sender, amount);
        
        emit Claim(msg.sender, amount);

        return amount;
    }

    function claim1() public returns (uint256 amount) {
        return 100-50;
    }
}