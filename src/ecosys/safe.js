import {ethers} from "ethers";
import Safe, {EthersAdapter} from "@safe-global/protocol-kit";
import SafeApiKit from "@safe-global/api-kit";


export async function init(options) {
  const {register, lifecycle, signer} = options;
  if (!register.safeWalletAddress) {
    return;
  }
  if (register.sourceSafeWalletUrl) {
    const safe = await initSafe({
      register,
      chainRpc: lifecycle.sourceChainRpc,
      safeWalletUrl: register.sourceSafeWalletUrl,
      signer,
    });
    options.sourceSafeSdk = safe.safeSdk;
    options.sourceSafeService = safe.safeService;
    options.sourceProvider = safe.provider;
    options.sourceNetwork = safe.network;
    options.sourceSigner = safe.wallet;
  }
  if (register.targetSafeWalletUrl) {
    const safe = await initSafe({
      register,
      chainRpc: lifecycle.targetChainRpc,
      safeWalletUrl: register.targetSafeWalletUrl,
      signer,
    });
    options.targetSafeSdk = safe.safeSdk;
    options.targetSafeService = safe.safeService;
    options.targetProvider = safe.provider;
    options.targetNetwork = safe.network;
    options.targetSigner = safe.wallet;
  }
}

async function initSafe(options) {
  const {register, chainRpc, signer, safeWalletUrl} = options;
  const provider = new ethers.JsonRpcProvider(chainRpc);
  const wallet = new ethers.Wallet(signer, provider);
  const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: wallet,
  });
  const safeSdk = await Safe.default.create({ethAdapter: ethAdapter, safeAddress: register.safeWalletAddress});

  const network = await provider.getNetwork();
  console.log(`init safe for chain ${network.chainId} with ${safeWalletUrl}`);
  const safeService = new SafeApiKit.default({
    chainId: network.chainId,
    txServiceUrl: safeWalletUrl,
    // txServiceUrl: 'https://httpbin.org/anything',
  });
  return {
    safeSdk,
    safeService,
    provider,
    network,
    wallet,
  };
}


export async function propose(options = {safeSdk, safeService, transactions, safeAddress, senderAddress}) {
  const {safeSdk, safeService, transactions, safeAddress, senderAddress} = options;
  const safeTransaction = await safeSdk.createTransaction({
    transactions
  });
  const safeTxHash = await safeSdk.getTransactionHash(safeTransaction);
  const senderSignature = await safeSdk.signTransaction(safeTransaction);
  const proposeTransactionProps = {
    safeAddress,
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress,
    senderSignature: senderSignature.signatures.get(senderAddress.toLowerCase()).data,
  };
  return await safeService.proposeTransaction(proposeTransactionProps);
}
