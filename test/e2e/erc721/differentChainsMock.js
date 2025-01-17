const TruffleAssert = require('truffle-assertions');
const Ethers = require('ethers');

const Helpers = require('../../helpers');

const BridgeContract = artifacts.require("Bridge");
const ERC721MintableContract = artifacts.require("ERC721MinterBurnerPauser");
const ERC721HandlerContract = artifacts.require("ERC721Handler");

contract('E2E ERC721 - Two EVM Chains', async accounts => {
    const originDomainID = 1;
    const destinationDomainID = 2;

    const adminAddress = accounts[0]
    const depositorAddress = accounts[1];
    const recipientAddress = accounts[2];
    const originRelayer1Address = accounts[3];
    const destinationRelayer1Address = accounts[4];

    const tokenID = 1;
    const expectedDepositNonce = 1;
    const feeData = '0x';

    let OriginBridgeInstance;
    let OriginERC721MintableInstance;
    let OriginERC721HandlerInstance;
    let originDepositData;
    let originDepositProposalData;
    let originResourceID;
    let originBurnableContractAddresses;

    let DestinationBridgeInstance;
    let DestinationERC721MintableInstance;
    let DestinationERC721HandlerInstance;
    let destinationDepositData;
    let destinationDepositProposalData;
    let destinationDepositProposalDataHash;
    let destinationResourceID;
    let destinationBurnableContractAddresses;

    let originDomainProposal;
    let destinationDomainProposal;

    beforeEach(async () => {
        await Promise.all([
            OriginBridgeInstance = await Helpers.deployBridge(originDomainID, adminAddress),
            DestinationBridgeInstance = await Helpers.deployBridge(destinationDomainID, adminAddress),
            ERC721MintableContract.new("token", "TOK", "").then(instance => OriginERC721MintableInstance = instance),
            ERC721MintableContract.new("token", "TOK", "").then(instance => DestinationERC721MintableInstance = instance)
        ]);

        originResourceID = Helpers.createResourceID(OriginERC721MintableInstance.address, originDomainID);
        originInitialResourceIDs = [originResourceID];
        originInitialContractAddresses = [OriginERC721MintableInstance.address];
        originBurnableContractAddresses = [];

        destinationResourceID = Helpers.createResourceID(DestinationERC721MintableInstance.address, originDomainID)
        destinationInitialResourceIDs = [destinationResourceID];
        destinationInitialContractAddresses = [DestinationERC721MintableInstance.address];
        destinationBurnableContractAddresses = [DestinationERC721MintableInstance.address];

        await Promise.all([
            ERC721HandlerContract.new(OriginBridgeInstance.address)
                .then(instance => OriginERC721HandlerInstance = instance),
            ERC721HandlerContract.new(DestinationBridgeInstance.address)
                .then(instance => DestinationERC721HandlerInstance = instance)
        ]);

        await OriginERC721MintableInstance.mint(depositorAddress, tokenID, "");

        await Promise.all([
            OriginERC721MintableInstance.approve(OriginERC721HandlerInstance.address, tokenID, { from: depositorAddress }),
            DestinationERC721MintableInstance.grantRole(await DestinationERC721MintableInstance.MINTER_ROLE(), DestinationERC721HandlerInstance.address),
            OriginBridgeInstance.adminSetResource(OriginERC721HandlerInstance.address, originResourceID, OriginERC721MintableInstance.address),
            DestinationBridgeInstance.adminSetResource(DestinationERC721HandlerInstance.address, destinationResourceID, DestinationERC721MintableInstance.address),
            DestinationBridgeInstance.adminSetBurnable(DestinationERC721HandlerInstance.address, destinationBurnableContractAddresses[0])
        ]);

        originDepositData = Helpers.createERCDepositData(tokenID, 20, recipientAddress);
        originDepositProposalData = Helpers.createERC721DepositProposalData(tokenID, 20, recipientAddress, 32, 0);

        destinationDepositData = Helpers.createERCDepositData(tokenID, 20, depositorAddress);
        destinationDepositProposalData = Helpers.createERC721DepositProposalData(tokenID, 20, depositorAddress, 32, 0)
        destinationDepositProposalDataHash = Ethers.utils.keccak256(OriginERC721HandlerInstance.address + destinationDepositProposalData.substr(2));

        originDomainProposal = {
          originDomainID: originDomainID,
          depositNonce: expectedDepositNonce,
          data: originDepositProposalData,
          resourceID: destinationResourceID
        };

        destinationDomainProposal = {
          originDomainID: destinationDomainID,
          depositNonce: expectedDepositNonce,
          data: destinationDepositProposalData,
          resourceID: originResourceID
        };

        // set MPC address to unpause the Bridge
        await OriginBridgeInstance.endKeygen(Helpers.mpcAddress);
        await DestinationBridgeInstance.endKeygen(Helpers.mpcAddress);
    });

    it("[sanity] depositorAddress' should own tokenID", async () => {
        const tokenOwner = await OriginERC721MintableInstance.ownerOf(tokenID);
        assert.strictEqual(depositorAddress, tokenOwner);
    });

    it("[sanity] ERC721HandlerInstance.address should have an allowance for tokenID from depositorAddress", async () => {
        const allowedAddress = await OriginERC721MintableInstance.getApproved(tokenID);
        assert.strictEqual(OriginERC721HandlerInstance.address, allowedAddress);
    });

    it("[sanity] DestinationERC721HandlerInstance.address should have minterRole for DestinationERC721MintableInstance", async () => {
        const isMinter = await DestinationERC721MintableInstance.hasRole(await DestinationERC721MintableInstance.MINTER_ROLE(), DestinationERC721HandlerInstance.address);
        assert.isTrue(isMinter);
    });

    it("E2E: tokenID of Origin ERC721 owned by depositAddress to Destination ERC721 owned by recipientAddress and back again", async () => {
      const originProposalSignedData = await Helpers.signTypedProposal(DestinationBridgeInstance.address, [originDomainProposal]);
      const destinationProposalSignedData = await Helpers.signTypedProposal(OriginBridgeInstance.address, [destinationDomainProposal]);


        let tokenOwner;

        // depositorAddress makes initial deposit of tokenID
        await TruffleAssert.passes(OriginBridgeInstance.deposit(
            destinationDomainID,
            originResourceID,
            originDepositData,
            feeData,
            { from: depositorAddress }
        ));

        // Handler should own tokenID
        tokenOwner = await OriginERC721MintableInstance.ownerOf(tokenID);
        assert.strictEqual(OriginERC721HandlerInstance.address, tokenOwner, "OriginERC721HandlerInstance.address does not own tokenID");

        // destinationRelayer2 executes the proposal
        await TruffleAssert.passes(DestinationBridgeInstance.executeProposal(
            originDomainProposal,
            originProposalSignedData,
            { from: destinationRelayer1Address }
        ));

        // Handler should still own tokenID of OriginERC721MintableInstance
        tokenOwner = await OriginERC721MintableInstance.ownerOf(tokenID);
        assert.strictEqual(OriginERC721HandlerInstance.address, tokenOwner, 'OriginERC721HandlerInstance.address does not own tokenID');

        // Assert ERC721 balance was transferred from depositorAddress
        tokenOwner = await DestinationERC721MintableInstance.ownerOf(tokenID);
        assert.strictEqual(tokenOwner, recipientAddress, "tokenID wasn't transferred from depositorAddress to recipientAddress");

        // At this point a representation of OriginERC721Mintable has been transferred from
        // depositor to the recipient using Both Bridges and DestinationERC721Mintable.
        // Next we will transfer DestinationERC721Mintable back to the depositor

        await DestinationERC721MintableInstance.approve(DestinationERC721HandlerInstance.address, tokenID, { from: recipientAddress });

        // recipientAddress makes a deposit of the received depositAmount
        await TruffleAssert.passes(DestinationBridgeInstance.deposit(
            originDomainID,
            destinationResourceID,
            destinationDepositData,
            feeData,
            { from: recipientAddress }
        ));

        // Token should no longer exist
        TruffleAssert.reverts(DestinationERC721MintableInstance.ownerOf(tokenID), "ERC721: owner query for nonexistent token")


        // originRelayer executes the proposal
        await TruffleAssert.passes(OriginBridgeInstance.executeProposal(
            destinationDomainProposal,
            destinationProposalSignedData,
            { from: originRelayer1Address }
        ));

        // Assert Destination tokenID no longer exists
        TruffleAssert.reverts(DestinationERC721MintableInstance.ownerOf(tokenID), "ERC721: owner query for nonexistent token")

        // Assert DestinationERC721MintableInstance tokenID was transferred to recipientAddress
        tokenOwner = await OriginERC721MintableInstance.ownerOf(tokenID);
        assert.strictEqual(depositorAddress, tokenOwner, 'OriginERC721MintableInstance tokenID was not transferred back to depositorAddress');
    });
});
