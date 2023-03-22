// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.22 <0.9;

contract StatefulContract {
    // the contract's owner, set in the constructor
    address owner;

    // the message we're storing
    string message;

    constructor(string memory message_) public {
        // set the owner of the contract for `kill()`
        owner = msg.sender;
        message = message_;
    }

    function set_message(string memory message_) public {
        // only allow the owner to update the message
        if (msg.sender != owner) return;
        message = message_;
    }

    // return a string
    function get_message() public view returns (string memory) {
        return message;
    }
}