import * as initialize from './ecosys/initialize.js'
import * as arg from './ecosys/arg.js'
import * as reg from './register/index.js'
import * as safepwd from './ecosys/safepwd.js'

// const BIN_PATH = path.resolve(__filename, '../');
// const WORK_PATH = path.resolve(BIN_PATH, '../../');

async function main() {
  const options = await initialize.init();
  const pargs = arg.programArguments();
  const cmd = pargs[0];
  switch (cmd) {
    case 'register':
      await reg.check();
      await reg.register(options);
      break;
    case 'encrypt':
      const privkey = await question(chalk.green('Give private key: '));
      const password = await question(chalk.green('Give password: '));
      await safepwd.encrypt(privkey, password);
      break;
    default:
      console.log(`unsupported command: ${cmd}`);
      process.exit(1);
      break;
  }
}

await main();
