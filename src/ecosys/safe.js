// import {ethers} from "ethers";
import Safe from "@safe-global/protocol-kit";
// import {EthersAdapter} from "@safe-global/protocol-kit";
import SafeApiKit from "@safe-global/api-kit";


const cachedSafe = {};
const cachedNonce = {};

export async function init(options) {
  const {register, lifecycle, signer} = options;
  if (!register.safeWalletAddress && !register.sourceSafeWalletAddress && !register.targetSafeWalletAddress) {
    return;
  }
  if (register.sourceSafeWalletUrl) {
    let safe;
    if (cachedSafe[lifecycle.sourceChain.code]) {
      safe = cachedSafe[lifecycle.sourceChain.code];
    } else {
      safe = await initSafe({
        register,
        chain: lifecycle.sourceChain,
        safeWalletUrl: register.sourceSafeWalletUrl,
        safeWalletAddress: register.safeWalletAddress ?? register.sourceSafeWalletAddress,
        signer,
      });
      cachedSafe[lifecycle.sourceChain.code] = safe;
    }

    options.sourceSafeSdk = safe.safeSdk;
    options.sourceSafeService = safe.safeService;
    // options.sourceSigner = safe.wallet;
  }
  if (register.targetSafeWalletUrl) {
    let safe;
    if (cachedSafe[lifecycle.targetChain.code]) {
      safe = cachedSafe[lifecycle.targetChain.code];
    } else {
      safe = await initSafe({
        register,
        chain: lifecycle.targetChain,
        safeWalletUrl: register.targetSafeWalletUrl,
        safeWalletAddress: register.safeWalletAddress ?? register.targetSafeWalletAddress,
        signer,
      });
      cachedSafe[lifecycle.targetChain.code] = safe;
    }

    options.targetSafeSdk = safe.safeSdk;
    options.targetSafeService = safe.safeService;
    // options.targetSigner = safe.wallet;
  }
}

async function initSafe(options) {
  const {chain, signer, safeWalletUrl, safeWalletAddress} = options;
  const safeSdk = await Safe.default.init({
    provider: chain.rpc,
    signer,
    safeAddress: safeWalletAddress,
  });

  // const provider = new ethers.JsonRpcProvider(chain.rpc);
  // const wallet = new ethers.Wallet(signer, provider);
  // const ethAdapter = new EthersAdapter({
  //   ethers,
  //   signerOrProvider: wallet,
  // });
  // const safeSdk = await Safe.default.create({ethAdapter: ethAdapter, safeAddress: safeWalletAddress});

  console.log(`init safe for chain ${chain.id} with ${safeWalletUrl}`);
  const safeService =  new SafeApiKit.default({
    chainId: chain.id,
    txServiceUrl: safeWalletUrl,
    // txServiceUrl: 'https://httpbin.org/anything',
  });
  return {
    safeSdk,
    safeService,
  };
}


export async function propose(options = {definition, safeSdk, safeService, transactions, safeAddress, senderAddress}) {
  const {definition, safeSdk, safeService, transactions, safeAddress, senderAddress} = options;
  const chainId = await safeSdk.getChainId();
  const remoteNonce = await safeSdk.getNonce();

  const safepin = definition.safepin[chainId];

  let nonce;
  if (cachedNonce[chainId]) {
    const cnonce = cachedNonce[chainId];
    nonce = cnonce > remoteNonce ? cnonce : remoteNonce;
  } else {
    nonce = remoteNonce;
  }

  let createTransactionOptions = {
    safeTxGas: 0,
    nonce,
  };
  if (safepin) {
    createTransactionOptions = {...createTransactionOptions, ...safepin};
  }
  const safeTransaction = await safeSdk.createTransaction({
    transactions,
    options: createTransactionOptions,
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
  const r = await safeService.proposeTransaction(proposeTransactionProps);
  cachedNonce[chainId] = nonce + 1;
  return r;
}
