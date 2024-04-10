import * as initialize from './ecosys/initialize.js'
import * as arg from './ecosys/arg.js'
import * as reg from './register/index.js'
import * as generateConfigure from './generator/generate_configure.js'
import * as safepwd from './ecosys/safepwd.js'

const BIN_PATH = path.resolve(__filename, '../');
// const WORK_PATH = path.resolve(BIN_PATH, '../../');


const help = `
helixbridge

  register            register a relayer
                      helixbridge register
                        --group=mainnet
                        --datadir=/path/to/config

  encrypt             encrypt a private key
                      helixbridge encrypt

  generate-configure  generate relayer configure
                      helixbridge generate-configure
                        --group=mainnet
                        --datadir=/path/to/config
                        [--encrypted-private-key=your_encrypted_private_key]
`;

async function main() {
  const options = await initialize.init(BIN_PATH);

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
      const encryptedPwd = await safepwd.encrypt(privkey, password);
      console.log(encryptedPwd);
      break;
    case 'generate-configure':
      await generateConfigure.check();
      await generateConfigure.generate(options);
      break;
    default:
      console.log(help);
      break;
  }
}

await main();
