// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract TheNFT is ERC721 {
    event Mint(address sender, uint256 nftId);

    uint256 private _tokenIds = 1;

    constructor() ERC721("TheNFT", "TNFT") {}

    function mint(address receiver)
        public
        returns (uint256)
    {
        uint256 newItemId = _tokenIds;
        _mint(receiver, _tokenIds);

        _tokenIds += 1;

        emit Mint(receiver, newItemId);
        return newItemId;
    }
}

contract TheNFTAuctions is IERC721Receiver {
    struct Auction {
        address payable seller;
        uint256 nftId;
        uint256 endAt;
        address payable highestBidder;
        uint256 highestBid;
    }

    TheNFT public nft;

    Auction[] public closed_auctions;
    uint256[] public open_auctions;
    mapping(uint256 => uint256) private indexOfNft;
    mapping(uint256 => Auction) public auctions;

    constructor(address _nft) {
        nft = TheNFT(_nft);
    }

    function startAuction(uint256 nftId, uint128 length) external {
        // Any time shorter then ~15 minutes might be concerning due to Block Timestamp Manipulation
        require(length >= 30 minutes, "Auction length is too short");
        // 0 is never a valid state of a TheNFT nft
        require(
            auctions[nftId].nftId == 0,
            "NFT is already in a public auction"
        );

        nft.safeTransferFrom(msg.sender, address(this), nftId, abi.encode((length)));
    }

    function onERC721Received(
        address,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external override returns (bytes4) {
        (uint128 length) = abi.decode(data, (uint128));
        // Any time shorter then ~15 minutes might be concerning due to Block Timestamp Manipulation
        require(length >= 30 minutes, "Auction length is too short");
        // 0 is never a valid state of a TheNFT nft
        require(
            auctions[tokenId].nftId == 0,
            "NFT is already in a public auction"
        );

        indexOfNft[tokenId] = open_auctions.length;
        open_auctions.push(tokenId);

        auctions[tokenId] = Auction({
            seller: payable(from),
            nftId: tokenId,
            endAt: block.timestamp + length,
            highestBidder: payable(address(0)),
            highestBid: 0
        });

        return IERC721Receiver.onERC721Received.selector;
    }

    function auctionBid(uint256 nftId) external payable {
        Auction storage auction = auctions[nftId];

        require(auction.nftId != 0, "NFT is not in a open auction");
        require(block.timestamp < auction.endAt, "Auction has ended");
        require(
            msg.value > auction.highestBid,
            "Message value is lower then highest bid"
        );

        if (auction.highestBidder != address(0)) {
            auction.highestBidder.transfer(auction.highestBid);
        }

        auction.highestBidder = payable(msg.sender);
        auction.highestBid = msg.value;
    }

    function auctionEnd(uint256 nftId) external {
        Auction storage auction = auctions[nftId];

        require(auction.nftId != 0, "NFT is not in a open auction");
        require(block.timestamp > auction.endAt, "Auction hasn't ended");

        if (auction.highestBidder != address(0)) {
            nft.safeTransferFrom(address(this), auction.highestBidder, nftId);
            auction.seller.transfer(auction.highestBid);
        } else {
            nft.safeTransferFrom(address(this), auction.seller, nftId);
        }

        uint256 index = indexOfNft[nftId];
        open_auctions[index] = open_auctions[open_auctions.length - 1];
        open_auctions.pop();
        delete indexOfNft[nftId];
        delete auctions[nftId];
    }
}
