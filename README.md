# ArtBid_FHE

ArtBid_FHE is a confidential auction platform that utilizes Zama's Fully Homomorphic Encryption (FHE) technology to ensure privacy for bidders and protect their identities and financial information. With ArtBid_FHE, participants can make encrypted bids, and the highest bid is revealed without exposing the bidders' details, creating a secure and private auction environment for art collectors and enthusiasts.

## The Problem

In traditional auction settings, bidders' offers are visible in cleartext, risking exposure of their identity, financial status, and bidding strategies. This lack of privacy can deter participants from engaging in high-stakes auctions, limiting the market dynamics and potentially undervaluing the art pieces. Moreover, in the digital age, where confidentiality is paramount, leveraging conventional auction mechanisms without adequate privacy protections can lead to significant security concerns.

## The Zama FHE Solution

ArtBid_FHE addresses these privacy and security gaps using Fully Homomorphic Encryption. By leveraging Zama's technology, bids are encrypted upon submission, allowing for computation on encrypted data. This means that auction organizers can determine the highest bid without ever accessing the cleartext values, ensuring that no sensitive information is compromised throughout the auction process.

Using fhevm to process encrypted inputs, ArtBid_FHE enhances the integrity of the auction process while preserving participant anonymity. This cutting-edge approach allows art collectors to bid confidently without fear of exposing their identities.

## Key Features

- **Encrypted Bidding:** Bidders submit encrypted bids that protect their identities and financial capabilities. 🔒
- **Confidential Auction Results:** The highest bid is revealed only at the end of the auction using homomorphic decryption, maintaining secrecy. 👁️‍🗨️
- **Secure Identity Protection:** Participants can take part in auctions without disclosing personal information. 🕵️‍♂️
- **High-End Auctioning Experience:** Tailored for high-value art pieces, ensuring competitive bidding among art enthusiasts. 🎨
- **User-Friendly Interface:** An accessible and intuitive interface for both bidders and auctioneers.

## Technical Architecture & Stack

ArtBid_FHE is built on a robust technology stack that prioritizes privacy and security. The architecture consists of:

- **Zama's FHE Technologies:** 
  - **fhevm** for processing encrypted bids.
- **Smart Contract Layer:** 
  - Solidity for defining auction mechanics and bids.
- **Frontend:** 
  - JavaScript/React for a user-friendly bidding interface.
- **Backend:** 
  - Node.js for server-side logic and interaction with the smart contracts.

## Smart Contract / Core Logic

The core logic in ArtBid_FHE is implemented through smart contracts that manage the bidding process. Here is a simplified pseudo-code snippet illustrating how bids are handled:

```solidity
pragma solidity ^0.8.0;

import "TFHE.sol";

contract ArtBid {
    struct Bid {
        uint64 encryptedBid; // Encrypted bid amount
        address bidder;      // Bidder's address
    }

    Bid public highestBid;

    function submitBid(uint64 _encryptedBid) public {
        // Process the encrypted bid
        require(TFHE.add(highestBid.encryptedBid, _encryptedBid) > highestBid.encryptedBid, "Bid not high enough");
        highestBid = Bid(_encryptedBid, msg.sender);
    }

    function revealWinningBid() public view returns (uint64) {
        return TFHE.decrypt(highestBid.encryptedBid);
    }
}
```

This example illustrates how bidders can submit encrypted bids, and the contract checks for the highest bid without ever revealing any cleartext data during the process.

## Directory Structure

The directory structure for ArtBid_FHE is organized as follows:

```
ArtBid_FHE/
├── contracts/
│   └── ArtBid.sol
├── scripts/
│   └── server.js
├── frontend/
│   └── index.js
└── README.md
```

## Installation & Setup

### Prerequisites

To get started with ArtBid_FHE, ensure you have the following installed:

- Node.js
- npm (Node Package Manager)
- A compatible Ethereum development environment (like Hardhat)

### Dependencies Installation

1. First, install the necessary dependencies for the project:

   ```bash
   npm install
   ```

2. Specifically, install Zama's `fhevm` library:

   ```bash
   npm install fhevm
   ```

3. If you need libraries for smart contract interactions, make sure to install Hardhat:

   ```bash
   npm install --save-dev hardhat
   ```

## Build & Run

To build and run the ArtBid_FHE project, follow these commands:

1. Compile the smart contracts:

   ```bash
   npx hardhat compile
   ```

2. Start the server:

   ```bash
   node scripts/server.js
   ```

3. Access the frontend application in your browser.

## Acknowledgements

We would like to extend our gratitude to Zama for providing the open-source Fully Homomorphic Encryption primitives that empower ArtBid_FHE. Their technology not only enhances security and privacy but also sets a new standard for what is possible in confidential online transactions.


