import * as safe from "../ecosys/safe.js";
import * as arg from "../ecosys/arg.js";
import * as tool from "../ecosys/tool.js";

export async function register(options) {
  const {register, lifecycle, definition} = options;

  const _targetChainId = await $`cast chain-id --rpc-url=${lifecycle.targetChainRpc}`;
  const targetChainId = _targetChainId.stdout.trim();
  let _sourceTokenDecimal;
  try {
    _sourceTokenDecimal = await $`cast call --rpc-url=${lifecycle.sourceChainRpc} ${register.sourceTokenAddress} 'decimals()()'`
    _sourceTokenDecimal = _sourceTokenDecimal.stdout.trim();
  } catch (e) {
    console.log(chalk.yellow(`[warn] can not query decimal from contract(${lifecycle.sourceChainName}): ${e}`));
  }
  const sourceTokenDecimal = tool.pickDecimal({
    definition,
    decimal: _sourceTokenDecimal,
    chain: lifecycle.sourceChainName,
    symbol: register.symbol,
  });

  const approve = BigInt(register.approve) * (10n ** sourceTokenDecimal);
  const baseFee = tool.floatToBigInt(register.baseFee, sourceTokenDecimal);
  const liquidityFeeRate = Number(register.liquidityFeeRate) * (10 ** 3);
  const deposit = BigInt(register.deposit) * (10n ** sourceTokenDecimal);

  const bridgeInfoRecord = await tool.queryBridgeInfoRecord({
    definition: options.definition,
    lifecycle,
    sourceTokenAddress: register.sourceTokenAddress,
    version: 'lnv2',
    bridge: 'lnv2-opposite',
  });

  const withdrawFlags = [];
  const depositedPenalty = BigInt(bridgeInfoRecord ? bridgeInfoRecord.margin : 0n);

  let setFeeDeposit = 0n;
  const gapForDepositTarget = deposit - depositedPenalty;
  if (tool.absBigInt(gapForDepositTarget) > 10n) {
    if (gapForDepositTarget > 0n) {
      setFeeDeposit = gapForDepositTarget;
    } else {
      // todo: withdrawFlags
    }
  }

  const approveFlags = [
    'approve(address,uint256)(bool)',
    register.contract,
    approve,
  ];
  const setFeeFlags = [
    'updateProviderFeeAndMargin(uint256,address,address,uint112,uint112,uint16)()',
    targetChainId,
    register.sourceTokenAddress,
    register.targetTokenAddress,
    setFeeDeposit,
    baseFee,
    liquidityFeeRate,
  ];

  const callOptions = {
    approveFlags,
    setFeeFlags,
    withdrawFlags
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
  const {approveFlags, setFeeFlags, withdrawFlags} = callOptions;
  const sourceSendFlags = [
    `--rpc-url=${lifecycle.sourceChainRpc}`,
  ];
  const targetSendFlags = [
    `--rpc-url=${lifecycle.targetChainRpc}`,
  ];

  const featureApprove = definition.features.approve;
  if (featureApprove.disable.indexOf(register.symbol) === -1) {
    approveFlags.unshift(...[
      ...targetSendFlags,
      register.targetTokenAddress,
    ]);
    await $`echo cast send ${approveFlags}`;
    approveFlags.unshift(`--private-key=${signer}`);
    const txApprove = await $`cast send ${approveFlags}`.quiet();
    console.log(txApprove.stdout);
  }

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
    register, lifecycle, definition,
    sourceSafeSdk, sourceSafeService, sourceSigner,
    targetSafeSdk, targetSafeService, targetSigner,
  } = options;
  const {approveFlags, setFeeFlags, withdrawFlags} = callOptions;

  const txApprove = await $`cast calldata ${approveFlags}`;
  const txSetFee = await $`cast calldata ${setFeeFlags}`;

  const p0Transactions = [];

  const featureApprove = definition.features.approve;
  if (featureApprove.disable.indexOf(register.symbol) === -1) {
    p0Transactions.push({
      to: register.targetTokenAddress,
      value: '0',
      data: txApprove.stdout.trim(),
    });
  }

  if (p0Transactions.length) {
    const p0 = await safe.propose({
      safeSdk: targetSafeSdk,
      safeService: targetSafeService,
      safeAddress: register.safeWalletAddress,
      senderAddress: targetSigner.address,
      transactions: p0Transactions,
    });
    console.log(
      chalk.green('proposed approve transaction to'),
      `${lifecycle.targetChainName}: ${register.safeWalletAddress} (safe)`
    );
    if (p0 && arg.isDebug()) {
      console.log(p0);
    }
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
      }
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

