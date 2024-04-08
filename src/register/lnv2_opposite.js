import * as safe from "../ecosys/safe.js";
import * as arg from "../ecosys/arg.js";

export async function register(options) {
  const {register, lifecycle} = options;

  const _sourceTokenDecimal = await $`cast call --rpc-url=${lifecycle.sourceChainRpc} ${register.sourceTokenAddress} 'decimals()()'`;
  const sourceTokenDecimal = BigInt(_sourceTokenDecimal);

  const approval = BigInt(register.approve) * (10n ** sourceTokenDecimal);
  const baseFee = BigInt(register.baseFee) * (10n ** sourceTokenDecimal);
  const liquidityFeeRate = Number(register.liquidityFeeRate) * (10 ** 3);
  const deposit = BigInt(register.deposit) * (10n ** sourceTokenDecimal);

  const approvalFlags = [
    'approve(address,uint256)(bool)',
    register.contract,
    approval,
  ];
  const setFeeFlags = [
    'updateProviderFeeAndMargin(uint256,address,address,uint112,uint112,uint16)()',
    register.targetChainId,
    register.sourceTokenAddress,
    register.targetTokenAddress,
    deposit,
    baseFee,
    liquidityFeeRate,
  ];

  const callOptions = {
    decimals: sourceTokenDecimal,
    baseFee,
    liquidityFeeRate,
    approvalFlags,
    setFeeFlags,
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
  const {approvalFlags, setFeeFlags} = callOptions;
  const sendFlags = [
    `--rpc-url=${lifecycle.sourceChainRpc}`,
    `--private-key=${signer}`
  ];

  await $`echo cast send ${approvalFlags}`;
  approvalFlags.unshift(...sendFlags);
  approvalFlags.unshift(register.sourceTokenAddress);
  const txApproval = await $`echo cast send ${approvalFlags}`.quiet();


  await $`echo cast send ${setFeeFlags}`;
  setFeeFlags.unshift(...sendFlags);
  setFeeFlags.unshift(register.contract);
  const txsetFee = await $`echo cast send ${setFeeFlags}`.quiet();
}

async function registerWithSafe(options, callOptions) {
  const {register, lifecycle, sourceSafeSdk, sourceSafeService, sourceSigner} = options;
  const {approvalFlags, setFeeFlags} = callOptions;

  const txApproval = await $`cast calldata ${approvalFlags}`;
  const txSetFee = await $`cast calldata ${setFeeFlags}`;

  const p0 = await safe.propose({
    safeSdk: sourceSafeSdk,
    safeService: sourceSafeService,
    safeAddress: register.safeWalletAddress,
    senderAddress: sourceSigner.address,
    transactions: [
      {
        to: register.sourceTokenAddress,
        value: '0',
        data: txApproval.stdout.trim(),
      },
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
  if (p0 && arg.isDebug()) {
    console.log(p0);
  }
}

