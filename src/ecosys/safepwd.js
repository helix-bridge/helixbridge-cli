

export async function encrypt(origin, password) {
  const output = await $`echo '${origin}' | openssl enc -aes-256-cbc -a -pbkdf2 -iter=100000 -pass='pass:${password}'`.quiet();
  return output.stdout.trim();
}

export async function decrypt(encrypted, password) {
  const output = await $`echo '${encrypted}' | openssl enc -aes-256-cbc -a -pbkdf2 -iter=100000 -pass='pass:${password}' -d`.quiet();
  return output.stdout.trim();
}
