import * as arg from '../ecosys/arg.js'
import * as safe from '../ecosys/safe.js'
import * as tool from '../ecosys/tool.js'

export async function register(options) {
  const {register, lifecycle} = options;

  const targetChainId = await $`cast chain-id --rpc-url=${lifecycle.targetChainRpc}`;
  const _sourceTokenDecimal = await $`cast call --rpc-url=${lifecycle.sourceChainRpc} ${register.sourceTokenAddress} 'decimals()()'`;
  const sourceTokenDecimal = BigInt(_sourceTokenDecimal);
  const baseFee = tool.floatToBigInt(register.baseFee, sourceTokenDecimal);
  const liquidityFeeRate = Number(register.liquidityFeeRate) * (10 ** 3);
  const transferLimit = BigInt(register.transferLimit) * (10n ** sourceTokenDecimal);
  const approve = BigInt(register.approve) * (10n ** sourceTokenDecimal);
  const deposit = BigInt(register.deposit) * (10n ** sourceTokenDecimal);

  const encodedParamForPenaltyReserves = register.sourceTokenAddress + (lifecycle.relayerAddress.toLowerCase().replace('0x', ''));
  const _depositedPenalty = await $`cast call \
    --rpc-url=${lifecycle.sourceChainRpc} \
    ${register.contract} \
    'penaltyReserves(bytes32)(uint256)' \
    $(cast keccak ${encodedParamForPenaltyReserves}) \
    | cut -d ' ' -f1 \
  `;

  const depositFlags = [];
  const withdrawFlags = [];
  const depositedPenalty = BigInt(_depositedPenalty.stdout.trim());
  const gapForDepositTarget = deposit - depositedPenalty;
  if (tool.absBigInt(gapForDepositTarget) > 10n) {
    if (gapForDepositTarget > 0n) {
      depositFlags.push(...[
        'depositPenaltyReserve(address,uint256)()',
        register.sourceTokenAddress,
        gapForDepositTarget,
      ]);
    } else {
      //# not open now
      // withdrawFlags.push(...[
      //   'withdrawPenaltyReserve(address,uint256)()',
      //   register.sourceTokenAddress,
      //   -gapForDepositTarget
      // ]);
    }
  }

  const approvalFlags = [
    'approve(address,uint256)(bool)',
    register.contract,
    approve,
  ];
  const setFeeFlags = [
    'registerLnProvider(uint256,address,address,uint112,uint16,uint112)()',
    targetChainId.stdout.trim(),
    register.sourceTokenAddress,
    register.targetTokenAddress,
    baseFee,
    liquidityFeeRate,
    transferLimit,
  ];
  const callOptions = {
    approvalFlags,
    setFeeFlags,
    depositFlags,
    withdrawFlags,
  };

  // call safe
  if (register.safeWalletAddress && register.sourceSafeWalletUrl) {
    await registerWithSafe(options, callOptions);
    return;
  }

  await registerWithCall(options, callOptions);
}


async function registerWithCall(options, callOptions) {
  const {register, lifecycle, definition, signer} = options;
  const {approvalFlags, depositFlags, setFeeFlags, withdrawFlags} = callOptions;
  const sendFlags = [
    `--rpc-url=${lifecycle.sourceChainRpc}`,
  ];

  const featureApprove = definition.features.approve;
  if (featureApprove.disable.indexOf(register.symbol) === -1) {
    approvalFlags.unshift(...[
      ...sendFlags,
      register.sourceTokenAddress,
    ]);
    await $`echo cast send ${approvalFlags}`;
    approvalFlags.unshift(`--private-key=${signer}`);
    const txApprove = await $`cast send ${approvalFlags}`.quiet();
    console.log(txApprove.stdout);
  }

  setFeeFlags.unshift(...[
    ...sendFlags,
    register.contract,
  ]);
  await $`echo cast send ${setFeeFlags}`;
  setFeeFlags.unshift(`--private-key=${signer}`);
  const txSetFee = await $`cast send ${setFeeFlags}`.quiet();
  console.log(txSetFee.stdout);

  if (depositFlags.length) {
    depositFlags.unshift(...[
      ...sendFlags,
      register.contract,
    ]);
    await $`echo cast send ${depositFlags}`
    depositFlags.unshift(`--private-key=${signer}`);
    const txDeposit = await $`cast send ${depositFlags}`.quiet();
    console.log(txDeposit.stdout);
  }
  if (withdrawFlags.length) {
    withdrawFlags.unshift(...[
      ...sendFlags,
      register.contract,
    ]);
    await $`echo cast send ${withdrawFlags}`
    withdrawFlags.unshift(`--private-key=${signer}`);
    const txWithdraw = await $`cast send ${withdrawFlags}`.quiet();
    console.log(txWithdraw.stdout);
  }
}


async function registerWithSafe(options, callOptions) {
  const {register, lifecycle, definition, sourceSafeSdk, sourceSafeService, sourceSigner} = options;
  const {approvalFlags, depositFlags, setFeeFlags, withdrawFlags} = callOptions;

  const txApprove = await $`cast calldata ${approvalFlags}`;
  const txSetFee = await $`cast calldata ${setFeeFlags}`;
  const featureApprove = definition.features.approve;

  const transactions =[];
  if (featureApprove.disable.indexOf(register.symbol) === -1) {
    transactions.push({
      to: register.sourceTokenAddress,
      value: '0',
      data: txApprove.stdout.trim(),
    });
  }

  transactions.push({
    to: register.contract,
    value: '0',
    data: txSetFee.stdout.trim(),
  });
  if (depositFlags.length) {
    const txDeposit = await $`cast calldata ${depositFlags}`;
    transactions.push({
      to: register.contract,
      value: '0',
      data: txDeposit.stdout.trim(),
    });
  }
  if (withdrawFlags.length) {
    const txWithdraw = await $`cast calldata ${withdrawFlags}`;
    transactions.push({
      to: register.contract,
      value: '0',
      data: txWithdraw.stdout.trim(),
    });
  }

  const p0 = await safe.propose({
    safeSdk: sourceSafeSdk,
    safeService: sourceSafeService,
    safeAddress: register.safeWalletAddress,
    senderAddress: sourceSigner.address,
    transactions,
  });
  console.log(
    chalk.green('proposed register transaction to'),
    `${lifecycle.sourceChainName}: ${register.safeWalletAddress} (safe)`
  );
  if (p0 && arg.isDebug()) {
    console.log(p0);
  }
}
