pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ArtBid_FHE is ZamaEthereumConfig {
    struct Bid {
        address bidder;
        euint32 encryptedBidAmount;
        uint256 timestamp;
        bool isDecrypted;
        uint32 decryptedBidAmount;
    }

    struct Auction {
        string nftURI;
        uint256 startTime;
        uint256 endTime;
        uint32 reservePrice;
        uint32 highestBidAmount;
        address highestBidder;
        bool isActive;
        bool isSettled;
    }

    mapping(string => Auction) public auctions;
    mapping(string => Bid[]) public auctionBids;
    mapping(string => mapping(address => bool)) public hasBid;

    event AuctionCreated(string indexed auctionId, string nftURI, uint256 startTime, uint256 endTime, uint32 reservePrice);
    event BidPlaced(string indexed auctionId, address indexed bidder, euint32 encryptedBidAmount);
    event AuctionSettled(string indexed auctionId, address winner, uint32 winningBidAmount);

    modifier auctionActive(string calldata auctionId) {
        require(auctions[auctionId].isActive, "Auction not active");
        require(block.timestamp >= auctions[auctionId].startTime && block.timestamp <= auctions[auctionId].endTime, "Bidding period closed");
        _;
    }

    constructor() ZamaEthereumConfig() {
    }

    function createAuction(
        string calldata auctionId,
        string calldata nftURI,
        uint256 startTime,
        uint256 endTime,
        uint32 reservePrice
    ) external {
        require(bytes(auctions[auctionId].nftURI).length == 0, "Auction already exists");
        require(endTime > startTime, "Invalid auction duration");
        require(endTime > block.timestamp, "Auction end time must be in future");

        auctions[auctionId] = Auction({
        nftURI: nftURI,
        startTime: startTime,
        endTime: endTime,
        reservePrice: reservePrice,
        highestBidAmount: 0,
        highestBidder: address(0),
        isActive: true,
        isSettled: false
        });

        emit AuctionCreated(auctionId, nftURI, startTime, endTime, reservePrice);
    }

    function placeBid(
        string calldata auctionId,
        externalEuint32 encryptedBidAmount,
        bytes calldata inputProof
    ) external auctionActive(auctionId) {
        require(!hasBid[auctionId][msg.sender], "Bidder can only bid once");
        require(FHE.isInitialized(FHE.fromExternal(encryptedBidAmount, inputProof)), "Invalid encrypted bid");

        euint32 encryptedBid = FHE.fromExternal(encryptedBidAmount, inputProof);
        FHE.allowThis(encryptedBid);
        FHE.makePubliclyDecryptable(encryptedBid);

        auctionBids[auctionId].push(Bid({
        bidder: msg.sender,
        encryptedBidAmount: encryptedBid,
        timestamp: block.timestamp,
        isDecrypted: false,
        decryptedBidAmount: 0
        }));

        hasBid[auctionId][msg.sender] = true;

        emit BidPlaced(auctionId, msg.sender, encryptedBid);
    }

    function settleAuction(string calldata auctionId) external {
        require(auctions[auctionId].isActive, "Auction not active");
        require(block.timestamp > auctions[auctionId].endTime, "Auction not ended");
        require(!auctions[auctionId].isSettled, "Auction already settled");

        (address winner, uint32 winningBidAmount) = _findHighestBid(auctionId);

        if (winner != address(0)) {
            auctions[auctionId].highestBidder = winner;
            auctions[auctionId].highestBidAmount = winningBidAmount;
            auctions[auctionId].isActive = false;
            auctions[auctionId].isSettled = true;

            emit AuctionSettled(auctionId, winner, winningBidAmount);
        } else {
            auctions[auctionId].isActive = false;
        }
    }

    function _findHighestBid(string calldata auctionId) internal returns (address, uint32) {
        address winner = address(0);
        uint32 highestBid = 0;

        for (uint i = 0; i < auctionBids[auctionId].length; i++) {
            Bid storage bid = auctionBids[auctionId][i];
            if (!bid.isDecrypted) {
                bytes32[] memory cts = new bytes32[](1);
                cts[0] = FHE.toBytes32(bid.encryptedBidAmount);

                bytes memory abiEncodedClearValue = FHE.decrypt(cts);
                uint32 decryptedBid = abi.decode(abiEncodedClearValue, (uint32));

                bid.decryptedBidAmount = decryptedBid;
                bid.isDecrypted = true;
            }

            if (bid.decryptedBidAmount > highestBid) {
                highestBid = bid.decryptedBidAmount;
                winner = bid.bidder;
            }
        }

        if (winner != address(0) && highestBid >= auctions[auctionId].reservePrice) {
            return (winner, highestBid);
        }
        return (address(0), 0);
    }

    function getAuction(string calldata auctionId) external view returns (
        string memory nftURI,
        uint256 startTime,
        uint256 endTime,
        uint32 reservePrice,
        uint32 highestBidAmount,
        address highestBidder,
        bool isActive,
        bool isSettled
    ) {
        Auction storage auction = auctions[auctionId];
        return (
        auction.nftURI,
        auction.startTime,
        auction.endTime,
        auction.reservePrice,
        auction.highestBidAmount,
        auction.highestBidder,
        auction.isActive,
        auction.isSettled
        );
    }

    function getBid(string calldata auctionId, uint index) external view returns (
        address bidder,
        euint32 encryptedBidAmount,
        uint256 timestamp,
        bool isDecrypted,
        uint32 decryptedBidAmount
    ) {
        Bid storage bid = auctionBids[auctionId][index];
        return (
        bid.bidder,
        bid.encryptedBidAmount,
        bid.timestamp,
        bid.isDecrypted,
        bid.decryptedBidAmount
        );
    }

    function getBidCount(string calldata auctionId) external view returns (uint) {
        return auctionBids[auctionId].length;
    }

    function hasUserBid(string calldata auctionId, address user) external view returns (bool) {
        return hasBid[auctionId][user];
    }
}


