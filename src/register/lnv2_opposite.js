import * as safe from "../ecosys/safe.js";
import * as arg from "../ecosys/arg.js";
import * as tool from "../ecosys/tool.js";

export async function register(options) {
  const {register, lifecycle} = options;

  const sourceChainId = lifecycle.sourceChain.id;
  const targetChainId = lifecycle.targetChain.id;
  const sourceTokenDecimal = BigInt(lifecycle.sourceToken.decimals);

  const approve = BigInt(register.approve) * (10n ** sourceTokenDecimal);
  const baseFee = tool.floatToBigInt(register.baseFee, sourceTokenDecimal);
  const liquidityFeeRate = Number(register.liquidityFeeRate) * (10 ** 3);
  const deposit = tool.floatToBigInt(register.deposit, sourceTokenDecimal);

  const bridgeInfoRecord = await tool.queryBridgeInfoRecord({
    definition: options.definition,
    lifecycle,
    sourceTokenAddress: lifecycle.sourceToken.address,
    version: 'lnv2',
    bridge: 'lnv2-opposite',
  });

  const withdrawFlags = [];
  const depositedPenalty = BigInt(bridgeInfoRecord ? bridgeInfoRecord.margin : 0n);

  let sourceDeposit = 0n;
  const gapForDepositTarget = deposit - depositedPenalty;
  if (tool.absBigInt(gapForDepositTarget) > 10n) {
    if (gapForDepositTarget > 0n) {
      sourceDeposit = gapForDepositTarget;
    } else {
      // todo: withdrawFlags
    }
  }

  const approveFlags = [
    'approve(address,uint256)(bool)',
    lifecycle.contractAddress,
    approve,
  ];
  const setFeeFlags = [
    'updateProviderFeeAndMargin(uint256,address,address,uint112,uint112,uint16)()',
    targetChainId,
    lifecycle.sourceToken.address,
    lifecycle.targetToken.address,
    sourceDeposit,
    baseFee,
    liquidityFeeRate,
  ];

  const callOptions = {
    approveFlags,
    setFeeFlags,
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
  const {approveFlags, setFeeFlags, withdrawFlags, sourceDeposit, sourceChainId} = callOptions;
  const sourceSendFlags = [
    `--rpc-url=${lifecycle.sourceChain.rpc}`,
  ];

  if (!tool.isDisableApprove({definition, symbol: register.symbol, chainId: sourceChainId})) {
    approveFlags.unshift(...[
      ...sourceSendFlags,
      lifecycle.sourceToken.address,
    ]);
    await $`echo cast send ${approveFlags}`;
    approveFlags.unshift(`--private-key=${signer}`);
    const txApprove = await $`cast send ${approveFlags}`.quiet();
    console.log(txApprove.stdout);
  }

  const setFeeFlagsValue = lifecycle.sourceToken.type === 'native'
    ? sourceDeposit
    : '0';
  setFeeFlags.unshift(...[
    ...sourceSendFlags,
    lifecycle.contractAddress,
    `--value=${setFeeFlagsValue}`,
  ]);
  await $`echo cast send ${setFeeFlags}`;
  setFeeFlags.unshift(`--private-key=${signer}`);
  const txSetFee = await $`cast send ${setFeeFlags}`.quiet();
  console.log(txSetFee.stdout);
}

async function registerWithSafe(options, callOptions) {
  const {
    register, lifecycle, definition, signer,
    sourceSafeSdk, sourceSafeService,
  } = options;
  const {approveFlags, setFeeFlags, withdrawFlags, sourceDeposit, sourceChainId} = callOptions;

  const _signerAddress = await $`cast wallet address ${signer}`.quiet();
  const signerAddress = _signerAddress.stdout.trim();

  const p0Transactions = [];

  if (!tool.isDisableApprove({definition, symbol: register.symbol, chainId: sourceChainId})) {
    const txApprove = await $`cast calldata ${approveFlags}`;
    p0Transactions.push({
      to: lifecycle.sourceToken.address,
      value: '0',
      data: txApprove.stdout.trim(),
    });
  }

  const txSetFee = await $`cast calldata ${setFeeFlags}`;
  p0Transactions.push({
    to: lifecycle.contractAddress,
    value: lifecycle.sourceToken.type === 'native'
      ? sourceDeposit.toString()
      : '0',
    data: txSetFee.stdout.trim(),
  });

  const p1 = await safe.propose({
    definition,
    safeSdk: sourceSafeSdk,
    safeService: sourceSafeService,
    safeAddress: register.sourceSafeWalletAddress ?? register.safeWalletAddress,
    senderAddress: signerAddress,
    transactions: p0Transactions,
  });
  console.log(
    chalk.green('proposed register transaction to'),
    `${lifecycle.sourceChain.code}: ${register.safeWalletAddress ?? register.sourceSafeWalletAddress} (safe)`
  );
  if (p1 && arg.isDebug()) {
    console.log(p1);
  }
}

