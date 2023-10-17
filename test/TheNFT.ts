import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("TheNFT", function () {
    const min_auction_time = 60 * 30;

    async function deploy_nft() {
        const TheNFT = await ethers.getContractFactory("TheNFT");
        const theNFT = await TheNFT.deploy();

        const [owner, second, third] = await ethers.getSigners();

        return { theNFT, owner, second, third}
    }

    async function deploy_minted_nft_and_empty_auction() {
        const { theNFT, owner, second, third } = await deploy_nft();

        await theNFT.mint(owner.address);

        const TheNFTAuctions = await ethers.getContractFactory("TheNFTAuctions");
        const auctions = await TheNFTAuctions.deploy(theNFT);

        await theNFT.setApprovalForAll(auctions.getAddress(), true);

        return { theNFT, auctions, owner, second, third }
    }

    describe("NFT", function () {
        it("Should have minted one nft with an ID of 1", async function () {
            const { theNFT, owner } = await loadFixture(deploy_nft);

            await expect(theNFT.mint(owner.address))
                .to.emit(theNFT, "Mint")
                .withArgs(anyValue, 1);
        });

        it("Should have the correct owner", async function () {
            const { theNFT, owner } = await loadFixture(deploy_nft);

            await expect(theNFT.mint(owner.address))
                .to.emit(theNFT, "Mint")
                .withArgs(owner.address, anyValue);
        });
    });

    describe("Auction", function () {
        describe("Validations", function () {
            it("Should only allow auctions over 30 minutes", async function () {
                const { auctions } = await loadFixture(deploy_minted_nft_and_empty_auction);
    
                await expect(auctions.startAuction(1, min_auction_time - 1)).to.be.revertedWith("Auction length is too short");
            });

            it("Shoudn't allow two auctions on one nft", async function () {
                const { auctions } = await loadFixture(deploy_minted_nft_and_empty_auction);
    
                await auctions.startAuction(1, min_auction_time);
                await expect(auctions.startAuction(1, min_auction_time)).to.be.revertedWith("NFT is already in a public auction");
            });
        });

        describe("Bidding", function () {
            it("Shoudn't bid if there is no auction to bid on", async function () {
                const { auctions, second } = await loadFixture(deploy_minted_nft_and_empty_auction);
    
                await expect(auctions.connect(second).auctionBid(1, { value: 10 })).to.be.revertedWith("NFT is not in a open auction");
            });

            it("You need to bid higher then the person before you", async function () {
                const { auctions, second, third } = await loadFixture(deploy_minted_nft_and_empty_auction);
    
                await auctions.startAuction(1, min_auction_time);
                await auctions.connect(second).auctionBid(1, { value: 100 });

                await expect(auctions.connect(third).auctionBid(1, { value: 10 })).to.be.revertedWith("Message value is lower then highest bid");
            });

            it("Shoudn't bid after the auction has ended", async function () {
                const { auctions, second } = await loadFixture(deploy_minted_nft_and_empty_auction);
    
                await auctions.startAuction(1, min_auction_time);

                await time.increaseTo((await time.latest()) + min_auction_time);

                await expect(auctions.connect(second).auctionBid(1, { value: 10 })).to.be.revertedWith("Auction has ended");
            });

            it("Should transfer the money back", async function () {
                const { auctions, second, third } = await loadFixture(deploy_minted_nft_and_empty_auction);
    
                await auctions.startAuction(1, min_auction_time);

                await (auctions.connect(second)).auctionBid(1, { value: 10 });

                expect(await auctions.connect(third).auctionBid(1, { value: 100 })).to.changeEtherBalances(
                    [auctions, second],
                    [100, 10]
                );;
            });
        });

        describe("End", function () {
            it("Shoudn't end if there is no auction to end", async function () {
                const { auctions, second } = await loadFixture(deploy_minted_nft_and_empty_auction);
    
                await expect(auctions.connect(second).auctionEnd(1)).to.be.revertedWith("NFT is not in a open auction");
            });

            it("Shoudn't end if it isn't time yet", async function () {
                const { auctions, second } = await loadFixture(deploy_minted_nft_and_empty_auction);
    
                await auctions.startAuction(1, min_auction_time);

                await expect(auctions.connect(second).auctionEnd(1)).to.be.revertedWith("Auction hasn't ended");
            });

            it("Should end if it is over the auction end time", async function () {
                const { auctions, second } = await loadFixture(deploy_minted_nft_and_empty_auction);
    
                await auctions.startAuction(1, min_auction_time);

                await time.increaseTo((await time.latest()) + min_auction_time);

                await auctions.auctionEnd(1);
            });


            it("Transfer NFT to winner", async function () {
                const { theNFT, auctions, second } = await loadFixture(deploy_minted_nft_and_empty_auction);
    
                await auctions.startAuction(1, min_auction_time);

                await (auctions.connect(second)).auctionBid(1, { value: 10 });

                await time.increaseTo((await time.latest()) + min_auction_time);

                await auctions.auctionEnd(1);

                expect(await theNFT.ownerOf(1)).eq(await second.getAddress());
            });
        });
    });
})