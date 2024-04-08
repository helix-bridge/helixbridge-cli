import * as safe from "../ecosys/safe.js";
import * as arg from "../ecosys/arg.js";

export async function register(options) {
  const {register, lifecycle} = options;

  const sourceChainId = await $`cast chain-id --rpc-url=${lifecycle.sourceChainRpc}`;
  const _sourceTokenDecimal = await $`cast call --rpc-url=${lifecycle.sourceChainRpc} ${register.sourceTokenAddress} 'decimals()()'`;
  const _targetTokenDecimal = await $`cast call --rpc-url=${lifecycle.targetChainRpc} ${register.targetTokenAddress} 'decimals()()'`;
  const sourceTokenDecimal = BigInt(_sourceTokenDecimal);
  const targetTokenDecimal = BigInt(_targetTokenDecimal);

  const approvalTargetChain = BigInt(register.approve) * (10n ** targetTokenDecimal);
  const baseFee = BigInt(register.baseFee) * (10n ** sourceTokenDecimal);
  const liquidityFeeRate = Number(register.liquidityFeeRate) * (10 ** 3);
  const deposit = BigInt(register.deposit) * (10n ** targetTokenDecimal);

  const approvalFlags = [
    'approve(address,uint256)(bool)',
    register.contract,
    approvalTargetChain,
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
    approvalFlags,
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
  const {approvalFlags, depositFlags, setFeeFlags} = callOptions;
  const sourceSendFlags = [
    `--rpc-url=${lifecycle.sourceChainRpc}`,
    `--private-key=${signer}`
  ];
  const targetSendFlags = [
    `--rpc-url=${lifecycle.targetChainRpc}`,
    `--private-key=${signer}`
  ];

  await $`echo cast send ${approvalFlags}`;
  approvalFlags.unshift(...targetSendFlags);
  approvalFlags.unshift(register.targetTokenAddress);
  const txApproval = await $`echo cast send ${approvalFlags}`.quiet();

  await $`echo cast send ${depositFlags}`;
  depositFlags.unshift(...targetSendFlags);
  depositFlags.unshift(register.contract);
  const txDeposit = await $`echo cast send ${depositFlags}`;

  await $`echo cast send ${setFeeFlags}`;
  setFeeFlags.unshift(...sourceSendFlags);
  setFeeFlags.unshift(register.contract);
  const txsetFee = await $`echo cast send ${setFeeFlags}`.quiet();
}

async function registerWithSafe(options, callOptions) {
  const {
    register, lifecycle,
    sourceSafeSdk, sourceSafeService, sourceSigner,
    targetSafeSdk, targetSafeService, targetSigner,
  } = options;
  const {approvalFlags, depositFlags, setFeeFlags} = callOptions;

  const txApproval = await $`cast calldata ${approvalFlags}`;
  const txDeposit = await $`cast calldata ${depositFlags}`;
  const txSetFee = await $`cast calldata ${setFeeFlags}`;

  const p0 = await safe.propose({
    safeSdk: targetSafeSdk,
    safeService: targetSafeService,
    safeAddress: register.safeWalletAddress,
    senderAddress: targetSigner.address,
    transactions: [
      {
        to: register.contract,
        value: '0',
        data: txApproval.stdout.trim(),
      },
      {
        to: register.contract,
        value: '0',
        data: txDeposit.stdout.trim(),
      },
    ],
  });
  console.log(
    chalk.green('proposed register transaction to'),
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

