import * as arg from '../ecosys/arg.js'
import * as safe from '../ecosys/safe.js'
import * as tool from '../ecosys/tool.js'

export async function register(options) {
  const {register, lifecycle} = options;

  const sourceChainId = lifecycle.sourceChain.id;
  const targetChainId = lifecycle.targetChain.id;
  const sourceTokenDecimal = BigInt(lifecycle.sourceToken.decimals);

  const baseFee = tool.floatToBigInt(register.baseFee, sourceTokenDecimal);
  const liquidityFeeRate = Number(register.liquidityFeeRate) * (10 ** 3);
  const transferLimit = tool.floatToBigInt(register.transferLimit, sourceTokenDecimal);
  const approve = BigInt(register.approve) * (10n ** sourceTokenDecimal);
  const deposit = BigInt(register.deposit) * (10n ** sourceTokenDecimal);

  const encodedParamForPenaltyReserves = lifecycle.sourceToken.address.toLowerCase()
    + (lifecycle.relayerAddress.toLowerCase().replace('0x', ''));
  const _depositedPenalty = await $`cast call \
    --rpc-url=${lifecycle.sourceChain.rpc} \
    ${lifecycle.contractAddress} \
    'penaltyReserves(bytes32)(uint256)' \
    $(cast keccak ${encodedParamForPenaltyReserves}) \
    | cut -d ' ' -f1 \
  `;

  const depositFlags = [];
  const withdrawFlags = [];
  const depositedPenalty = BigInt(_depositedPenalty.stdout.trim());
  const sourceDeposit = deposit - depositedPenalty;
  if (tool.absBigInt(sourceDeposit) > 10n) {
    if (sourceDeposit > 0n) {
      depositFlags.push(...[
        'depositPenaltyReserve(address,uint256)()',
        lifecycle.sourceToken.address,
        sourceDeposit,
      ]);
    } else {
      //# not open now
      // withdrawFlags.push(...[
      //   'withdrawPenaltyReserve(address,uint256)()',
      //   lifecycle.sourceToken.address,
      //   -sourceDeposit
      // ]);
    }
  }

  const approvalFlags = [
    'approve(address,uint256)(bool)',
    lifecycle.contractAddress,
    approve,
  ];
  const setFeeFlags = [
    'registerLnProvider(uint256,address,address,uint112,uint16,uint112)()',
    targetChainId,
    lifecycle.sourceToken.address,
    lifecycle.targetToken.address,
    baseFee,
    liquidityFeeRate,
    transferLimit,
  ];
  const callOptions = {
    approvalFlags,
    setFeeFlags,
    depositFlags,
    withdrawFlags,
    sourceDeposit,
    sourceChainId,
  };

  // call safe
  if ((register.safeWalletAddress || register.sourceSafeWalletAddress) && register.sourceSafeWalletUrl) {
    await registerWithSafe(options, callOptions);
    return;
  }

  await registerWithCall(options, callOptions);
}


async function registerWithCall(options, callOptions) {
  const {register, lifecycle, definition, signer} = options;
  const {approvalFlags, depositFlags, setFeeFlags, withdrawFlags, sourceDeposit, sourceChainId} = callOptions;
  const sendFlags = [
    `--rpc-url=${lifecycle.sourceChain.rpc}`,
  ];

  if (!tool.isDisableApprove({definition, symbol: register.symbol, chainId: sourceChainId})) {
    approvalFlags.unshift(...[
      ...sendFlags,
      lifecycle.sourceToken.address,
    ]);
    await $`echo cast send ${approvalFlags}`;
    approvalFlags.unshift(`--private-key=${signer}`);
    const txApprove = await $`cast send ${approvalFlags}`.quiet();
    console.log(txApprove.stdout);
  }

  setFeeFlags.unshift(...[
    ...sendFlags,
    lifecycle.contractAddress,
  ]);
  await $`echo cast send ${setFeeFlags}`;
  setFeeFlags.unshift(`--private-key=${signer}`);
  const txSetFee = await $`cast send ${setFeeFlags}`.quiet();
  console.log(txSetFee.stdout);

  if (depositFlags.length) {
    const depositFlagsValue = lifecycle.sourceToken.type === 'native'
      ? sourceDeposit
      : '0';
    depositFlags.unshift(...[
      ...sendFlags,
      lifecycle.contractAddress,
      `--value=${depositFlagsValue}`,
    ]);
    await $`echo cast send ${depositFlags}`
    depositFlags.unshift(`--private-key=${signer}`);
    const txDeposit = await $`cast send ${depositFlags}`.quiet();
    console.log(txDeposit.stdout);
  }
  if (withdrawFlags.length) {
    withdrawFlags.unshift(...[
      ...sendFlags,
      lifecycle.contractAddress,
    ]);
    await $`echo cast send ${withdrawFlags}`
    withdrawFlags.unshift(`--private-key=${signer}`);
    const txWithdraw = await $`cast send ${withdrawFlags}`.quiet();
    console.log(txWithdraw.stdout);
  }
}


async function registerWithSafe(options, callOptions) {
  const {register, lifecycle, signer, definition, sourceSafeSdk, sourceSafeService} = options;
  const {approvalFlags, depositFlags, setFeeFlags, withdrawFlags, sourceDeposit, sourceChainId} = callOptions;

  const txApprove = await $`cast calldata ${approvalFlags}`;
  const txSetFee = await $`cast calldata ${setFeeFlags}`;
  const _signerAddress = await $`cast wallet address ${signer}`.quiet();
  const signerAddress = _signerAddress.stdout.trim();

  const transactions = [];
  if (!tool.isDisableApprove({definition, symbol: register.symbol, chainId: sourceChainId})) {
    transactions.push({
      to: lifecycle.sourceToken.address,
      value: '0',
      data: txApprove.stdout.trim(),
    });
  }

  transactions.push({
    to: lifecycle.contractAddress,
    value: '0',
    data: txSetFee.stdout.trim(),
  });
  if (depositFlags.length) {
    const txDeposit = await $`cast calldata ${depositFlags}`;
    transactions.push({
      to: lifecycle.contractAddress,
      value: lifecycle.sourceToken.type === 'native'
        ? sourceDeposit
        : '0',
      data: txDeposit.stdout.trim(),
    });
  }
  if (withdrawFlags.length) {
    const txWithdraw = await $`cast calldata ${withdrawFlags}`;
    transactions.push({
      to: lifecycle.contractAddress,
      value: '0',
      data: txWithdraw.stdout.trim(),
    });
  }

  const p0 = await safe.propose({
    definition,
    safeSdk: sourceSafeSdk,
    safeService: sourceSafeService,
    safeAddress: register.sourceSafeWalletAddress ?? register.safeWalletAddress,
    senderAddress: signerAddress,
    transactions,
  });
  console.log(
    chalk.green('proposed register transaction to'),
    `${lifecycle.sourceChain.code}: ${register.safeWalletAddress ?? register.sourceSafeWalletAddress} (safe)`
  );
  if (p0 && arg.isDebug()) {
    console.log(p0);
  }
}
