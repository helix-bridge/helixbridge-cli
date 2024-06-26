import * as safe from "../ecosys/safe.js";
import * as arg from "../ecosys/arg.js";
import * as tool from '../ecosys/tool.js';
import {isDisableApprove} from "../ecosys/tool.js";

export async function register(options) {
  const {register, lifecycle, definition} = options;

  const _sourceChainId = await $`cast chain-id --rpc-url=${lifecycle.sourceChainRpc}`;
  const _targetChainId = await $`cast chain-id --rpc-url=${lifecycle.targetChainRpc}`;
  let _sourceTokenDecimal;
  try {
    _sourceTokenDecimal = await $`cast call --rpc-url=${lifecycle.sourceChainRpc} ${register.sourceTokenAddress} 'decimals()()'`;
    _sourceTokenDecimal = _sourceChainId.stdout.trim();
  } catch (e) {
    console.log(chalk.yellow(`[warn] can not query decimal from contract(${lifecycle.sourceChainName}): ${e}`));
  }
  let _targetTokenDecimal;
  try {
    _targetTokenDecimal = await $`cast call --rpc-url=${lifecycle.targetChainRpc} ${register.targetTokenAddress} 'decimals()()'`;
    _targetTokenDecimal = _targetTokenDecimal.stdout.trim();
  } catch (e) {
    console.log(chalk.yellow(`[warn] can not query decimal from contract(${lifecycle.targetChainName}): ${e}`));
  }

  const sourceChainId = _sourceChainId.stdout.trim();
  const targetChainId = _targetChainId.stdout.trim();
  const sourceTokenDecimal = tool.pickDecimal({
    definition,
    decimal: _sourceTokenDecimal,
    chain: lifecycle.sourceChainName,
    symbol: register.symbol,
  });
  const targetTokenDecimal = tool.pickDecimal({
    definition,
    decimal: _targetTokenDecimal,
    chain: lifecycle.targetChainName,
    symbol: register.symbol,
  });

  const approveTargetChain = BigInt(register.approve) * (10n ** targetTokenDecimal);
  const baseFee = tool.floatToBigInt(register.baseFee, sourceTokenDecimal);
  const liquidityFeeRate = Number(register.liquidityFeeRate) * (10 ** 3);
  const deposit = BigInt(register.deposit) * (10n ** targetTokenDecimal);

  const bridgeInfoRecord = await tool.queryBridgeInfoRecord({
    definition: options.definition,
    lifecycle,
    sourceTokenAddress: register.sourceTokenAddress,
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
        register.sourceTokenAddress,
        register.targetTokenAddress,
        sourceDepositToTarget,
      ]);
    } else {
      // sourceDepositToTarget = -sourceDepositToTarget;
      // withdrawFlags.push(...[
      //   'requestWithdrawMargin(uint256,address,address,uint112,bytes)()',
      //   targetChainId,
      //   register.sourceTokenAddress,
      //   register.targetTokenAddress,
      //   sourceDepositToTarget,
      //   50n * 10n ** 18n,
      //   lifecycle.relayerAddress,
      // ]);
    }
  }

  const approveFlags = [
    'approve(address,uint256)(bool)',
    register.contract,
    approveTargetChain,
  ];
  const setFeeFlags = [
    'setProviderFee(uint256,address,address,uint112,uint8)()',
    targetChainId,
    register.sourceTokenAddress,
    register.targetTokenAddress,
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
    `--rpc-url=${lifecycle.sourceChainRpc}`,
  ];
  const targetSendFlags = [
    `--rpc-url=${lifecycle.targetChainRpc}`,
  ];

  if (!tool.isDisableApprove({definition, symbol: register.symbol, chainId: targetChainId})) {
    approveFlags.unshift(...[
      ...targetSendFlags,
      register.targetTokenAddress,
    ]);
    await $`echo cast send ${approveFlags}`;
    approveFlags.unshift(`--private-key=${signer}`);
    const txApprove = await $`cast send ${approveFlags}`.quiet();
    console.log(txApprove.stdout);
  }

  const depositFlagsValue = tool.isNativeToken({definition, symbol: register.symbol, chainId: targetChainId})
    ? sourceDepositToTarget
    : '0';
  if (depositFlags.length) {
    depositFlags.unshift(...[
      ...targetSendFlags,
      register.contract,
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
      register.contract,
    ]);
    await $`echo cast send ${withdrawFlags}`;
    withdrawFlags.unshift(`--private-key=${signer}`);
    const txWithdraw = await $`cast send ${withdrawFlags}`.quiet();
    await $`cast calldata ${withdrawFlags}`;
    console.log(txWithdraw.stdout);
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
  const {approveFlags, depositFlags, setFeeFlags, withdrawFlags, sourceDepositToTarget, targetChainId} = callOptions;

  const txApprove = await $`cast calldata ${approveFlags}`;
  const txSetFee = await $`cast calldata ${setFeeFlags}`;

  const p0Transactions = [];
  if (!tool.isDisableApprove({definition, symbol: register.symbol, chainId: targetChainId})) {
    p0Transactions.push({
      to: register.targetTokenAddress,
      value: '0',
      data: txApprove.stdout.trim(),
    });
  }
  if (depositFlags.length) {
    const txDeposit = await $`cast calldata ${depositFlags}`;
    p0Transactions.push({
      to: register.contract,
      value: tool.isNativeToken({definition, symbol: register.symbol, chainId: targetChainId})
        ? sourceDepositToTarget.toString()
        : '0',
      data: txDeposit.stdout.trim(),
    });
  }

  if (p0Transactions.length) {
    const p0 = await safe.propose({
      definition,
      safeSdk: targetSafeSdk,
      safeService: targetSafeService,
      safeAddress: register.targetSafeWalletAddress ?? register.safeWalletAddress,
      senderAddress: targetSigner.address,
      transactions: p0Transactions,
    });
    console.log(
      chalk.green('proposed deposit transaction to'),
      `${lifecycle.targetChainName}: ${register.safeWalletAddress ?? register.targetSafeWalletAddress} (safe)`
    );
    if (p0 && arg.isDebug()) {
      console.log(p0);
    }
  }

  const p1Transactions = [
    {
      to: register.contract,
      value: '0',
      data: txSetFee.stdout.trim(),
    },
  ];
  if (withdrawFlags.length) {
    const txWithdraw = await $`cast calldata ${withdrawFlags}`;
    p1Transactions.push({
      to: register.contract,
      value: '0',
      data: txWithdraw.stdout.trim(),
    });
  }

  const p1 = await safe.propose({
    definition,
    safeSdk: sourceSafeSdk,
    safeService: sourceSafeService,
    safeAddress: register.sourceSafeWalletAddress ?? register.safeWalletAddress,
    senderAddress: sourceSigner.address,
    transactions: p1Transactions,
  });
  console.log(
    chalk.green('proposed register transaction to'),
    `${lifecycle.sourceChainName}: ${register.safeWalletAddress ?? register.sourceSafeWalletAddress} (safe)`
  );
  if (p1 && arg.isDebug()) {
    console.log(p1);
  }
}

