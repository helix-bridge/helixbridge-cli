import * as arg from '../ecosys/arg.js'
import * as safe from '../ecosys/safe.js'

export async function register(options) {
  const {register, lifecycle} = options;

  const _sourceTokenDecimal = await $`cast call --rpc-url=${lifecycle.sourceChainRpc} ${register.sourceTokenAddress} 'decimals()()'`;
  const sourceTokenDecimal = BigInt(_sourceTokenDecimal);
  const baseFee = BigInt(register.baseFee) * (10n ** sourceTokenDecimal);
  const liquidityFeeRate = Number(register.liquidityFeeRate) * (10 ** 3);
  const transferLimit = BigInt(register.transferLimit) * (10n ** sourceTokenDecimal);
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
    decimals: sourceTokenDecimal,
    baseFee,
    transferLimit,
    liquidityFeeRate,
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
  const {depositFlags, setFeeFlags} = callOptions;
  const sendFlags = [
    register.contract,
    `--rpc-url=${lifecycle.sourceChainRpc}`,
    `--private-key=${signer}`
  ];

  await $`echo cast send ${setFeeFlags}`;
  setFeeFlags.unshift(...sendFlags);
  const txSetFee = await $`echo cast send ${setFeeFlags}`.quiet();


  await $`echo cast send ${depositFlags}`
  depositFlags.unshift(...sendFlags);
  const txDeposit = await $`echo cast send ${depositFlags}`.quiet();
}


async function registerWithSafe(options, callOptions) {
  const {register, lifecycle, sourceSafeSdk, sourceSafeService, sourceSigner} = options;
  const {depositFlags, setFeeFlags} = callOptions;

  const txSetFee = await $`cast calldata ${setFeeFlags}`;
  const txDeposit = await $`cast calldata ${depositFlags}`;

  const p0 = await safe.propose({
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
