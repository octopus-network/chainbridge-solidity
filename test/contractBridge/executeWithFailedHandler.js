const TruffleAssert = require('truffle-assertions');
const Ethers = require('ethers');

const Helpers = require('../helpers');
const { convertCompilerOptionsFromJson } = require('typescript');

const BridgeContract = artifacts.require("Bridge");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC20HandlerContract = artifacts.require("HandlerRevert");
const ERC721MintableContract = artifacts.require("ERC721MinterBurnerPauser");
const ERC721HandlerContract = artifacts.require("ERC721Handler");
const ERC721RevertMintableContract = artifacts.require("ERC721MinterBurnerPauser");
const ERC721RevertHandlerContract = artifacts.require("HandlerRevert");
const ERC1155MintableContract = artifacts.require("ERC1155PresetMinterPauser");
const ERC1155HandlerContract = artifacts.require("HandlerRevert");
const CentrifugeAssetContract = artifacts.require("CentrifugeAsset");
const GenericHandlerContract = artifacts.require("GenericHandler");

contract('Bridge - [execute - FailedHandlerExecution]', async accounts => {
    const originDomainID = 1;
    const destinationDomainID = 2;
    const adminAddress = accounts[0]
    const depositorAddress = accounts[1];
    const recipientAddress = accounts[2];
    const relayer1Address = accounts[3];

    const tokenID = 1;
    const erc721DepositMetadata = "0xf00d";
    const initialTokenAmount = 100;
    const depositAmount = 10;
    const expectedDepositNonces = [1, 2, 3, 4, 5];
    const feeData = '0x';

    let BridgeInstance;
    let ERC20MintableInstance;
    let ERC20HandlerInstance;
    let ERC721MintableInstance;
    let ERC721HandlerInstance;
    let ERC721RevertMintableInstance;
    let ERC721RevertHandlerInstance;
    let ERC1155MintableInstance;
    let ERC1155HandlerInstance;
    let CentrifugeAssetInstance;
    let GenericHandlerInstance;


    let initialGenericContractAddress;
    let initialGenericDepositFunctionSignature;
    let initialGenericDepositFunctionDepositorOffset;
    let initialGenericExecuteFunctionSignature;

    let erc20ResourceID;
    let erc721ResourceID;
    let erc721RevertResourceID;
    let erc1155ResourceID;
    let genericResourceID;
    let erc20DepositData;
    let erc20DepositProposalData;
    let erc721DepositData;
    let erc721RevertDepositData;
    let erc721DepositProposalData;
    let erc721RevertDepositProposalData;
    let erc1155DepositData;
    let erc1155DepositProposalData;
    let genericProposalData;
    let genericDepositProposalDataHash;

    let proposalsForExecution;

    beforeEach(async () => {
        await Promise.all([
            BridgeInstance = await Helpers.deployBridge(destinationDomainID, adminAddress),
            ERC20MintableContract.new("token20", "TOK20").then(instance => ERC20MintableInstance = instance),
            ERC721MintableContract.new("token721", "TOK721", "").then(instance => ERC721MintableInstance = instance),
            ERC721RevertMintableContract.new("Rtoken721", "RTOK721", "").then(instance => ERC721RevertMintableInstance = instance),
            ERC1155MintableContract.new("TOK1155").then(instance => ERC1155MintableInstance = instance),
            CentrifugeAssetContract.new().then(instance => CentrifugeAssetInstance = instance)
        ]);

        ERC20HandlerInstance = await ERC20HandlerContract.new(BridgeInstance.address);
        ERC721HandlerInstance = await ERC721HandlerContract.new(BridgeInstance.address);
        ERC721RevertHandlerInstance = await ERC721RevertHandlerContract.new(BridgeInstance.address);
        ERC1155HandlerInstance = await ERC1155HandlerContract.new(BridgeInstance.address);
        GenericHandlerInstance = await GenericHandlerContract.new(BridgeInstance.address);


        erc20ResourceID = Helpers.createResourceID(ERC20MintableInstance.address, originDomainID);
        erc721ResourceID = Helpers.createResourceID(ERC721MintableInstance.address, originDomainID);
        erc721RevertResourceID = Helpers.createResourceID(ERC721RevertMintableInstance.address, originDomainID);
        erc1155ResourceID = Helpers.createResourceID(ERC1155MintableInstance.address, originDomainID);
        genericResourceID = Helpers.createResourceID(GenericHandlerInstance.address, originDomainID);

        initialGenericContractAddress = ERC20MintableInstance.address;
        initialGenericDepositFunctionSignature = Helpers.blankFunctionSig;
        initialGenericDepositFunctionDepositorOffset = Helpers.blankFunctionDepositorOffset;
        initialGenericExecuteFunctionSignature = Helpers.getFunctionSignature(ERC20MintableContract, 'mint');

        await Promise.all([
            ERC20MintableInstance.mint(depositorAddress, initialTokenAmount),
            BridgeInstance.adminSetResource(ERC20HandlerInstance.address, erc20ResourceID, ERC20MintableInstance.address),
            ERC721MintableInstance.grantRole(await ERC721MintableInstance.MINTER_ROLE(), ERC721HandlerInstance.address),
            ERC721RevertMintableInstance.grantRole(await ERC721RevertMintableInstance.MINTER_ROLE(), ERC721RevertHandlerInstance.address),
            ERC721MintableInstance.mint(depositorAddress, tokenID, erc721DepositMetadata),
            ERC721RevertMintableInstance.mint(depositorAddress, tokenID, erc721DepositMetadata),
            BridgeInstance.adminSetResource(ERC721HandlerInstance.address, erc721ResourceID, ERC721MintableInstance.address),
            BridgeInstance.adminSetResource(ERC721RevertHandlerInstance.address, erc721RevertResourceID, ERC721RevertMintableInstance.address),
            ERC1155MintableInstance.mintBatch(depositorAddress, [tokenID], [initialTokenAmount], "0x0"),
            BridgeInstance.adminSetResource(ERC1155HandlerInstance.address, erc1155ResourceID, ERC1155MintableInstance.address),
            BridgeInstance.adminSetGenericResource(GenericHandlerInstance.address, genericResourceID, initialGenericContractAddress, initialGenericDepositFunctionSignature, initialGenericDepositFunctionDepositorOffset, initialGenericExecuteFunctionSignature)
        ]);

        await Promise.all([
            ERC20MintableInstance.approve(ERC20HandlerInstance.address, 5000, { from: depositorAddress }),
            ERC721MintableInstance.approve(ERC721HandlerInstance.address, tokenID, { from: depositorAddress }),
            ERC721RevertMintableInstance.approve(ERC721RevertHandlerInstance.address, tokenID, { from: depositorAddress }),
            ERC1155MintableInstance.setApprovalForAll(ERC1155HandlerInstance.address, true, { from: depositorAddress })
        ]);

        erc20DepositData = Helpers.createERCDepositData(depositAmount, 20, recipientAddress)
        erc20DepositProposalData = Helpers.createERCDepositData(depositAmount, 20, recipientAddress)
        erc20DepositProposalDataHash = Ethers.utils.keccak256(ERC20HandlerInstance.address + erc20DepositProposalData.substr(2));

        erc721DepositData = Helpers.createERCDepositData(tokenID, 20, recipientAddress);
        erc721DepositProposalData = Helpers.createERC721DepositProposalData(tokenID, 20, recipientAddress, erc721DepositMetadata.length, erc721DepositMetadata);
        erc721DepositProposalDataHash = Ethers.utils.keccak256(ERC721HandlerInstance.address + erc721DepositProposalData.substr(2));

        erc721RevertDepositData = Helpers.createERCDepositData(tokenID, 20, recipientAddress);
        erc721RevertDepositProposalData = Helpers.createERC721DepositProposalData(tokenID, 20, recipientAddress, erc721DepositMetadata.length, erc721DepositMetadata);
        erc721RevertDepositProposalDataHash = Ethers.utils.keccak256(ERC721RevertHandlerInstance.address + erc721RevertDepositProposalData.substr(2));

        erc1155DepositData = Helpers.createERC1155DepositData([tokenID], [depositAmount]);
        erc1155DepositProposalData = Helpers.createERC1155DepositProposalData([tokenID], [depositAmount], recipientAddress, "0x");

        genericProposalData = Helpers.createGenericDepositData(null);
        genericDepositProposalDataHash = Ethers.utils.keccak256(GenericHandlerInstance.address + genericProposalData.substr(2));

        proposalsForExecution = [{
          originDomainID: originDomainID,
          depositNonce: expectedDepositNonces[0],
          resourceID: erc20ResourceID,
          data: erc20DepositProposalData
        },
        {
          originDomainID: originDomainID,
          depositNonce: expectedDepositNonces[1],
          resourceID: erc721ResourceID,
          data: erc721DepositProposalData
        },
        {
          originDomainID: originDomainID,
          depositNonce: expectedDepositNonces[2],
          resourceID: erc721RevertResourceID,
          data: erc721RevertDepositProposalData
        },
        {
          originDomainID: originDomainID,
          depositNonce: expectedDepositNonces[3],
          data: erc1155DepositProposalData,
          resourceID: erc1155ResourceID,
        },
        {
          originDomainID: originDomainID,
          depositNonce: expectedDepositNonces[4],
          resourceID: genericResourceID,
          data: genericProposalData
        }];

        // set MPC address to unpause the Bridge
        await BridgeInstance.endKeygen(Helpers.mpcAddress);
    });

    it("[executeProposal - ERC20] - Should not revert if handler execution failed. FailedHandlerExecution event should be emitted", async () => {
        const depositProposalBeforeFailedExecute = await BridgeInstance.isProposalExecuted(
            originDomainID, expectedDepositNonces[0]);

        // depositNonce is not used
        assert.isFalse(depositProposalBeforeFailedExecute);

        const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposalsForExecution[0]]);

        const executeTx = await BridgeInstance.executeProposal(
            proposalsForExecution[0],
            proposalSignedData,
            { from: relayer1Address }
        );

        TruffleAssert.eventEmitted(executeTx, 'FailedHandlerExecution', (event) => {
            return event.originDomainID.toNumber() === originDomainID &&
                event.depositNonce.toNumber() === expectedDepositNonces[0] &&
                Ethers.utils.parseBytes32String('0x' + event.lowLevelData.slice(-64)) === 'Something bad happened'
        });

        const depositProposalAfterFailedExecute = await BridgeInstance.isProposalExecuted(
          originDomainID, expectedDepositNonces[0]);

        // depositNonce is not used
        assert.isFalse(depositProposalAfterFailedExecute);
    });

    it("[executeProposal - ERC721] - Should not revert if handler execution failed. FailedHandlerExecution event should be emitted", async () => {
        const depositProposalBeforeFailedExecute = await BridgeInstance.isProposalExecuted(
            originDomainID, expectedDepositNonces[2]);

        // depositNonce is not used
        assert.isFalse(depositProposalBeforeFailedExecute);

        const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposalsForExecution[2]]);

        const executeTx = await BridgeInstance.executeProposal(
            proposalsForExecution[2],
            proposalSignedData,
            { from: relayer1Address }
        );

        TruffleAssert.eventEmitted(executeTx, 'FailedHandlerExecution', (event) => {
            return event.originDomainID.toNumber() === originDomainID &&
                event.depositNonce.toNumber() === expectedDepositNonces[2] &&
                Ethers.utils.parseBytes32String('0x' + event.lowLevelData.slice(-64)) === 'Something bad happened'
        });

        const depositProposalAfterFailedExecute = await BridgeInstance.isProposalExecuted(
            originDomainID, expectedDepositNonces[2]);

        // depositNonce is not used
        assert.isFalse(depositProposalAfterFailedExecute);
    });

    it("[executeProposal - ERC1155] - Should not revert if handler execution failed. FailedHandlerExecution event should be emitted", async () => {
        const depositProposalBeforeFailedExecute = await BridgeInstance.isProposalExecuted(
            originDomainID, expectedDepositNonces[3]);

        // depositNonce is not used
        assert.isFalse(depositProposalBeforeFailedExecute);

        const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposalsForExecution[3]]);

        const executeTx = await BridgeInstance.executeProposal(
            proposalsForExecution[3],
            proposalSignedData,
            { from: relayer1Address }
        );

        TruffleAssert.eventEmitted(executeTx, 'FailedHandlerExecution', (event) => {
            return event.originDomainID.toNumber() === originDomainID &&
                event.depositNonce.toNumber() === expectedDepositNonces[3] &&
                Ethers.utils.parseBytes32String('0x' + event.lowLevelData.slice(-64)) === 'Something bad happened'
        });

        const depositProposalAfterFailedExecute = await BridgeInstance.isProposalExecuted(
            originDomainID, expectedDepositNonces[3]);

        // depositNonce is not used
        assert.isFalse(depositProposalAfterFailedExecute);
    });

    it("[executeProposal - Generic] - Should not revert if handler execution failed. FailedHandlerExecution event should be emitted", async () => {
        const depositProposalBeforeFailedExecute = await BridgeInstance.isProposalExecuted(
          originDomainID, expectedDepositNonces[4]);

        // depositNonce is not used
        assert.isFalse(depositProposalBeforeFailedExecute);

        const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposalsForExecution[4]]);

        const executeTx = await BridgeInstance.executeProposal(
            proposalsForExecution[4],
            proposalSignedData,
            { from: relayer1Address }
        );

        // check that "FailedHandlerExecution" event was emitted on the handler
        const handlerPastEvents = await GenericHandlerInstance.getPastEvents('FailedHandlerExecution')
        assert(handlerPastEvents[0].event === 'FailedHandlerExecution');

        TruffleAssert.eventEmitted(executeTx, 'ProposalExecution', (event) => {
            return event.originDomainID.toNumber() === originDomainID &&
                event.depositNonce.toNumber() === expectedDepositNonces[4] &&
                event.dataHash === genericDepositProposalDataHash
        });

        const depositProposalAfterFailedExecute = await BridgeInstance.isProposalExecuted(
          originDomainID, expectedDepositNonces[4]);

        // depositNonce is used
        assert.isTrue(depositProposalAfterFailedExecute);
    });

    it("[executeProposals] - Should not revert if handler execute is reverted and continue to process next execution. FailedHandlerExecution event should be emitted with expected values.", async () => {
        const depositProposalBeforeFailedExecute = await BridgeInstance.isProposalExecuted(
            originDomainID, expectedDepositNonces[0]);

        // depositNonce is not used
        assert.isFalse(depositProposalBeforeFailedExecute);

        const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, proposalsForExecution);

        // depositorAddress makes initial deposit of depositAmount
        await TruffleAssert.passes(BridgeInstance.deposit(
            originDomainID,
            erc721ResourceID,
            erc721DepositData,
            feeData,
            { from: depositorAddress }
        ));

        // check that all nonces in nonce set are 0
        const noncesSetBeforeDeposit = await BridgeInstance.usedNonces(originDomainID, 0);
        assert.equal(
          Helpers.decimalToPaddedBinary(noncesSetBeforeDeposit.toNumber()),
          // nonces:                                          ...9876543210
          "0000000000000000000000000000000000000000000000000000000000000000"
        );

        const executeTx = await BridgeInstance.executeProposals(
            proposalsForExecution,
            proposalSignedData,
            { from: relayer1Address }
        );

        TruffleAssert.eventEmitted(executeTx, 'FailedHandlerExecution', (event) => {
          return event.originDomainID.toNumber() === originDomainID &&
              event.depositNonce.toNumber() === expectedDepositNonces[0] &&
              Ethers.utils.parseBytes32String('0x' + event.lowLevelData.slice(-64)) === 'Something bad happened'
        });

        const erc20depositProposalAfterFailedExecute = await BridgeInstance.isProposalExecuted(
          originDomainID, expectedDepositNonces[0]
        );
        // depositNonce for failed ERC20 deposit is unset
        assert.isFalse(erc20depositProposalAfterFailedExecute);

        const erc721depositProposal = await BridgeInstance.isProposalExecuted(
          originDomainID, expectedDepositNonces[1]
        );
        // depositNonce for ERC721 deposit is used
        assert.isTrue(erc721depositProposal);

        const genericDepositProposal = await BridgeInstance.isProposalExecuted(
          originDomainID, expectedDepositNonces[4]
        );
        // depositNonce for generic deposit is used
        assert.isTrue(genericDepositProposal);


        // recipient ERC20 token balances hasn't changed
        const recipientERC20Balance = await ERC20MintableInstance.balanceOf(recipientAddress);
        assert.strictEqual(recipientERC20Balance.toNumber(), 0);

        // recipient ERC721 token balance has changed to 1 token
        const recipientERC721Balance = await ERC721MintableInstance.balanceOf(recipientAddress);
        assert.strictEqual(recipientERC721Balance.toNumber(), 1);

        // check that other nonces in nonce set are not affected after failed deposit
        const noncesSetAfterDeposit = await BridgeInstance.usedNonces(originDomainID, 0);
        assert.equal(
          Helpers.decimalToPaddedBinary(noncesSetAfterDeposit.toNumber()),
          // nonces:                                          ...9876543210
          "0000000000000000000000000000000000000000000000000000000000100100"
        );

        // check that 'ProposalExecution' event has been emitted with proper values for ERC721Revert deposit
        assert.equal(executeTx.logs[1].args.originDomainID, 1);
        assert.equal(executeTx.logs[1].args.depositNonce, expectedDepositNonces[1]);
        assert.equal(executeTx.logs[1].args.dataHash, erc721DepositProposalDataHash);

        // check that 'ProposalExecution' event has been emitted with proper values for generic deposit
        assert.equal(executeTx.logs[4].args.originDomainID, 1);
        assert.equal(executeTx.logs[4].args.depositNonce, expectedDepositNonces[4]);
        assert.equal(executeTx.logs[4].args.dataHash, genericDepositProposalDataHash);
    });
});
