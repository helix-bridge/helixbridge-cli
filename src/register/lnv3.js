import * as arg from '../ecosys/arg.js'
import * as safe from '../ecosys/safe.js'

export async function register(options) {
  const {register, lifecycle} = options;

  const _sourceTokenDecimal = await $`cast call --rpc-url=${lifecycle.sourceChainRpc} ${register.sourceTokenAddress} 'decimals()()'`;
  const sourceTokenDecimal = BigInt(_sourceTokenDecimal);
  const baseFee = BigInt(register.baseFee) * (10n ** sourceTokenDecimal);
  const liquidityFeeRate = Number(register.liquidityFeeRate) * (10 ** 3);
  const transferLimit = BigInt(register.transferLimit) * (10n ** sourceTokenDecimal);
  const approve = BigInt(register.approve) * (10n ** sourceTokenDecimal);


  const approvalFlags = [
    'approve(address,uint256)(bool)',
    register.contract,
    approve,
  ];
  const setFeeFlags = [
    'registerLnProvider(uint256,address,address,uint112,uint16,uint112)()',
    register.targetChainId,
    register.sourceTokenAddress,
    register.targetTokenAddress,
    baseFee,
    liquidityFeeRate,
    transferLimit,
  ];
  const depositFlags = [
    'depositPenaltyReserve(address,uint256)()',
    register.sourceTokenAddress,
    BigInt(register.deposit) * (10n ** sourceTokenDecimal),
  ];
  const callOptions = {
    approvalFlags,
    setFeeFlags,
    depositFlags,
  };

  // call safe
  if (register.safeWalletAddress && register.sourceSafeWalletUrl) {
    await registerWithSafe(options, callOptions);
    return;
  }

  await registerWithCall(options, callOptions);
}


async function registerWithCall(options, callOptions) {
  const {register, lifecycle, signer} = options;
  const {approvalFlags, depositFlags, setFeeFlags} = callOptions;
  const sendFlags = [
    `--rpc-url=${lifecycle.sourceChainRpc}`,
  ];

  approvalFlags.unshift(...[
    ...sendFlags,
    register.sourceTokenAddress,
  ]);
  await $`echo cast send ${approvalFlags}`;
  approvalFlags.unshift(`--private-key=${signer}`);
  const txApprove = await $`cast send ${approvalFlags}`.quiet();
  console.log(txApprove.stdout);

  setFeeFlags.unshift(...[
    ...sendFlags,
    register.contract,
  ]);
  await $`echo cast send ${setFeeFlags}`;
  setFeeFlags.unshift(`--private-key=${signer}`);
  const txSetFee = await $`cast send ${setFeeFlags}`.quiet();
  console.log(txSetFee.stdout);

  depositFlags.unshift(...[
    ...sendFlags,
    register.contract,
  ]);
  await $`echo cast send ${depositFlags}`
  depositFlags.unshift(`--private-key=${signer}`);
  const txDeposit = await $`cast send ${depositFlags}`.quiet();
  console.log(txDeposit.stdout);
}


async function registerWithSafe(options, callOptions) {
  const {register, lifecycle, sourceSafeSdk, sourceSafeService, sourceSigner} = options;
  const {approvalFlags, depositFlags, setFeeFlags} = callOptions;

  const txApprove = await $`cast calldata ${approvalFlags}`;
  const txSetFee = await $`cast calldata ${setFeeFlags}`;
  const txDeposit = await $`cast calldata ${depositFlags}`;

  const p0 = await safe.propose({
    safeSdk: sourceSafeSdk,
    safeService: sourceSafeService,
    safeAddress: register.safeWalletAddress,
    senderAddress: sourceSigner.address,
    transactions: [
      {
        to: register.sourceTokenAddress,
        value: '0',
        data: txApprove.stdout.trim(),
      },
      {
        to: register.contract,
        value: '0',
        data: txSetFee.stdout.trim(),
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
    `${lifecycle.sourceChainName}: ${register.safeWalletAddress} (safe)`
  );
  if (p0 && arg.isDebug()) {
    console.log(p0);
  }
}
