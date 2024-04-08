import * as safe from "../ecosys/safe.js";
import * as arg from "../ecosys/arg.js";

export async function register(options) {
  const {register, lifecycle} = options;

  const sourceChainId = await $`cast chain-id --rpc-url=${lifecycle.sourceChainRpc}`;
  const _sourceTokenDecimal = await $`cast call --rpc-url=${lifecycle.sourceChainRpc} ${register.sourceTokenAddress} 'decimals()()'`;
  const _targetTokenDecimal = await $`cast call --rpc-url=${lifecycle.targetChainRpc} ${register.targetTokenAddress} 'decimals()()'`;
  const sourceTokenDecimal = BigInt(_sourceTokenDecimal);
  const targetTokenDecimal = BigInt(_targetTokenDecimal);

  const approveTargetChain = BigInt(register.approve) * (10n ** targetTokenDecimal);
  const baseFee = BigInt(register.baseFee) * (10n ** sourceTokenDecimal);
  const liquidityFeeRate = Number(register.liquidityFeeRate) * (10 ** 3);
  const deposit = BigInt(register.deposit) * (10n ** targetTokenDecimal);

  const approveFlags = [
    'approve(address,uint256)(bool)',
    register.contract,
    approveTargetChain,
  ];
  const depositFlags = [
    'depositProviderMargin(uint256,address,address,uint256)()',
    sourceChainId.stdout.trim(),
    register.sourceTokenAddress,
    register.targetTokenAddress,
    deposit,
  ];
  const setFeeFlags = [
    'setProviderFee(uint256,address,address,uint112,uint8)()',
    register.targetChainId,
    register.sourceTokenAddress,
    register.targetTokenAddress,
    baseFee,
    liquidityFeeRate,
  ];

  const callOptions = {
    approveFlags,
    depositFlags,
    setFeeFlags,
  };

  // call safe
  if (register.safeWalletAddress && register.sourceSafeWalletUrl && register.targetSafeWalletUrl) {
    await registerWithSafe(options, callOptions);
    return;
  }

  await registerWithCall(options, callOptions);
}

async function registerWithCall(options, callOptions) {
  const {register, lifecycle, signer} = options;
  const {approveFlags, depositFlags, setFeeFlags} = callOptions;
  const sourceSendFlags = [
    `--rpc-url=${lifecycle.sourceChainRpc}`,
  ];
  const targetSendFlags = [
    `--rpc-url=${lifecycle.targetChainRpc}`,
  ];

  approveFlags.unshift(...[
    ...targetSendFlags,
    register.targetTokenAddress,
  ]);
  await $`echo cast send ${approveFlags}`;
  approveFlags.unshift(`--private-key=${signer}`);
  const txApprove = await $`cast send ${approveFlags}`.quiet();
  console.log(txApprove.stdout);

  depositFlags.unshift(...[
    ...targetSendFlags,
    register.contract,
  ]);
  await $`echo cast send ${depositFlags}`;
  depositFlags.unshift(`--private-key=${signer}`);
  const txDeposit = await $`cast send ${depositFlags}`;
  console.log(txDeposit.stdout);

  setFeeFlags.unshift(...[
    ...sourceSendFlags,
    register.contract,
  ]);
  await $`echo cast send ${setFeeFlags}`;
  setFeeFlags.unshift(`--private-key=${signer}`);
  const txSetFee = await $`cast send ${setFeeFlags}`.quiet();
  console.log(txSetFee.stdout);
}

async function registerWithSafe(options, callOptions) {
  const {
    register, lifecycle,
    sourceSafeSdk, sourceSafeService, sourceSigner,
    targetSafeSdk, targetSafeService, targetSigner,
  } = options;
  const {approveFlags, depositFlags, setFeeFlags} = callOptions;

  const txApprove = await $`cast calldata ${approveFlags}`;
  const txDeposit = await $`cast calldata ${depositFlags}`;
  const txSetFee = await $`cast calldata ${setFeeFlags}`;

  const p0 = await safe.propose({
    safeSdk: targetSafeSdk,
    safeService: targetSafeService,
    safeAddress: register.safeWalletAddress,
    senderAddress: targetSigner.address,
    transactions: [
      {
        to: register.targetTokenAddress,
        value: '0',
        data: txApprove.stdout.trim(),
      },
      {
        to: register.contract,
        value: '0',
        data: txDeposit.stdout.trim(),
      },
    ],
  });
  console.log(
    chalk.green('proposed deposit transaction to'),
    `${lifecycle.targetChainName}: ${register.safeWalletAddress} (safe)`
  );
  if (p0 && arg.isDebug()) {
    console.log(p0);
  }

  const p1 = await safe.propose({
    safeSdk: sourceSafeSdk,
    safeService: sourceSafeService,
    safeAddress: register.safeWalletAddress,
    senderAddress: sourceSigner.address,
    transactions: [
      {
        to: register.contract,
        value: '0',
        data: txSetFee.stdout.trim(),
      },
    ],
  });
  console.log(
    chalk.green('proposed register transaction to'),
    `${lifecycle.sourceChainName}: ${register.safeWalletAddress} (safe)`
  );
  if (p1 && arg.isDebug()) {
    console.log(p1);
  }
}

