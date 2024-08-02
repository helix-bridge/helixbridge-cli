import * as safe from "../ecosys/safe.js";
import * as arg from "../ecosys/arg.js";
import * as tool from '../ecosys/tool.js';

export async function register(options) {
  const {register, lifecycle} = options;

  const sourceChainId = lifecycle.sourceChain.id;
  const targetChainId = lifecycle.targetChain.id;
  const sourceTokenDecimal = BigInt(lifecycle.sourceToken.decimals);
  const targetTokenDecimal = BigInt(lifecycle.targetToken.decimals);

  const approveTargetChain = BigInt(register.approve) * (10n ** targetTokenDecimal);
  const baseFee = tool.floatToBigInt(register.baseFee, sourceTokenDecimal);
  const liquidityFeeRate = Number(register.liquidityFeeRate) * (10 ** 3);
  const deposit = BigInt(register.deposit) * (10n ** targetTokenDecimal);

  const bridgeInfoRecord = await tool.queryBridgeInfoRecord({
    definition: options.definition,
    lifecycle,
    sourceTokenAddress: lifecycle.sourceToken.address,
    version: 'lnv2',
    bridge: 'lnv2-default',
  });
  const depositFlags = [];
  const withdrawFlags = [];
  const depositedPenalty = BigInt(bridgeInfoRecord ? bridgeInfoRecord.margin : 0n);

  let sourceDepositToTarget = deposit - depositedPenalty;
  if (tool.absBigInt(sourceDepositToTarget) > 10n) {
    if (sourceDepositToTarget > 0n) {
      depositFlags.push(...[
        'depositProviderMargin(uint256,address,address,uint256)()',
        sourceChainId,
        lifecycle.sourceToken.address,
        lifecycle.targetToken.address,
        sourceDepositToTarget,
      ]);
    } else {
      // sourceDepositToTarget = -sourceDepositToTarget;
      // withdrawFlags.push(...[
      //   'requestWithdrawMargin(uint256,address,address,uint112,bytes)()',
      //   targetChainId,
      //   lifecycle.sourceToken.address,
      //   lifecycle.targetToken.address,
      //   sourceDepositToTarget,
      //   50n * 10n ** 18n,
      //   lifecycle.relayerAddress,
      // ]);
    }
  }

  const approveFlags = [
    'approve(address,uint256)(bool)',
    lifecycle.contractAddress,
    approveTargetChain,
  ];
  const setFeeFlags = [
    'setProviderFee(uint256,address,address,uint112,uint8)()',
    targetChainId,
    lifecycle.sourceToken.address,
    lifecycle.targetToken.address,
    baseFee,
    liquidityFeeRate,
  ];

  const callOptions = {
    approveFlags,
    depositFlags,
    setFeeFlags,
    withdrawFlags,
    sourceDepositToTarget,
    targetChainId,
  };

  // call safe
  if (register.sourceSafeWalletUrl && register.targetSafeWalletUrl) {
    if (!register.safeWalletAddress && !register.sourceSafeWalletAddress && !register.targetSafeWalletAddress) {
      console.log('missing safe wallet address');
      return;
    }
    await registerWithSafe(options, callOptions);
    return;
  }

  await registerWithCall(options, callOptions);
}

async function registerWithCall(options, callOptions) {
  const {register, lifecycle, definition, signer} = options;
  const {approveFlags, depositFlags, setFeeFlags, withdrawFlags, sourceDepositToTarget, targetChainId} = callOptions;
  const sourceSendFlags = [
    `--rpc-url=${lifecycle.sourceChain.rpc}`,
  ];
  const targetSendFlags = [
    `--rpc-url=${lifecycle.targetChain.rpc}`,
  ];

  if (!tool.isDisableApprove({definition, symbol: register.symbol, chainId: targetChainId})) {
    approveFlags.unshift(...[
      ...targetSendFlags,
      lifecycle.targetToken.address,
    ]);
    await $`echo cast send ${approveFlags}`;
    approveFlags.unshift(`--private-key=${signer}`);
    const txApprove = await $`cast send ${approveFlags}`.quiet();
    console.log(txApprove.stdout);
  }

  const depositFlagsValue = lifecycle.targetToken.type === 'native'
    ? sourceDepositToTarget
    : '0';
  if (depositFlags.length) {
    depositFlags.unshift(...[
      ...targetSendFlags,
      lifecycle.contractAddress,
      ` --value=${depositFlagsValue}`,
    ]);
    await $`echo cast send ${depositFlags}`;
    depositFlags.unshift(`--private-key=${signer}`);
    const txDeposit = await $`cast send ${depositFlags}`.quiet();
    console.log(txDeposit.stdout);
  }

  if (withdrawFlags.length) {
    withdrawFlags.unshift(...[
      ...sourceSendFlags,
      lifecycle.contractAddress,
    ]);
    await $`echo cast send ${withdrawFlags}`;
    withdrawFlags.unshift(`--private-key=${signer}`);
    const txWithdraw = await $`cast send ${withdrawFlags}`.quiet();
    await $`cast calldata ${withdrawFlags}`;
    console.log(txWithdraw.stdout);
  }

  setFeeFlags.unshift(...[
    ...sourceSendFlags,
    lifecycle.contractAddress,
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
    targetSafeSdk, targetSafeService,
  } = options;
  const {approveFlags, depositFlags, setFeeFlags, withdrawFlags, sourceDepositToTarget, targetChainId} = callOptions;

  const txApprove = await $`cast calldata ${approveFlags}`;
  const txSetFee = await $`cast calldata ${setFeeFlags}`;
  const _signerAddress = await $`cast wallet address ${signer}`.quiet();
  const signerAddress = _signerAddress.stdout.trim();

  const p0Transactions = [];
  if (!tool.isDisableApprove({definition, symbol: register.symbol, chainId: targetChainId})) {
    p0Transactions.push({
      to: lifecycle.targetToken.address,
      value: '0',
      data: txApprove.stdout.trim(),
    });
  }
  if (depositFlags.length) {
    const txDeposit = await $`cast calldata ${depositFlags}`;
    p0Transactions.push({
      to: lifecycle.contractAddress,
      value: lifecycle.targetToken.type === 'native'
        ? sourceDepositToTarget.toString()
        : '0',
      data: txDeposit.stdout.trim(),
    });
  }

  console.log(p0Transactions);
  if (p0Transactions.length) {
    const p0 = await safe.propose({
      definition,
      safeSdk: targetSafeSdk,
      safeService: targetSafeService,
      safeAddress: register.targetSafeWalletAddress ?? register.safeWalletAddress,
      senderAddress: signerAddress,
      transactions: p0Transactions,
    });
    console.log(
      chalk.green('proposed deposit transaction to'),
      `${lifecycle.targetChain.code}: ${register.safeWalletAddress ?? register.targetSafeWalletAddress} (safe)`
    );
    if (p0 && arg.isDebug()) {
      console.log(p0);
    }
  }

  const p1Transactions = [
    {
      to: lifecycle.contractAddress,
      value: '0',
      data: txSetFee.stdout.trim(),
    },
  ];
  if (withdrawFlags.length) {
    const txWithdraw = await $`cast calldata ${withdrawFlags}`;
    p1Transactions.push({
      to: lifecycle.contractAddress,
      value: '0',
      data: txWithdraw.stdout.trim(),
    });
  }

  const p1 = await safe.propose({
    definition,
    safeSdk: sourceSafeSdk,
    safeService: sourceSafeService,
    safeAddress: register.sourceSafeWalletAddress ?? register.safeWalletAddress,
    senderAddress: signerAddress,
    transactions: p1Transactions,
  });
  console.log(
    chalk.green('proposed register transaction to'),
    `${lifecycle.sourceChain.code}: ${register.safeWalletAddress ?? register.sourceSafeWalletAddress} (safe)`
  );
  if (p1 && arg.isDebug()) {
    console.log(p1);
  }
}

