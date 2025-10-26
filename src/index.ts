import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { $ } from "zx";
import ky from "ky";

import { extract } from "tar";

async function main() {
  await rm("packages", { recursive: true, force: true });
  await mkdir("packages/source", { recursive: true });
  await mkdir("packages/v4-core", { recursive: true });
  await mkdir("packages/v4-periphery", { recursive: true });

  const extendedReadme = await readFile("./EXT.md", "utf-8");

  for await (const packageName of ["v4-core", "v4-periphery"]) {
    const packageTarball = await $`npm view @uniswap/${packageName} dist.tarball`;

    await ky
      .get(packageTarball.stdout.trim())
      .then((e) => e.arrayBuffer())
      .then(async (data) => writeFile(`./packages/source/${packageName}.tgz`, Buffer.from(data)));

    await extract({
      file: `./packages/source/${packageName}.tgz`,
      cwd: `./packages/${packageName}`,
    });

    await readFile(`./packages/${packageName}/package/package.json`, "utf-8").then((data) =>
      writeFile(
        `./packages/${packageName}/package/package.json`,
        data
          .replace(`@uniswap/${packageName}`, packageName) // Remove namespace
          .replace(
            `git+https://github.com/Uniswap/${packageName}.git`,
            `git+https://github.com/hookmate/v4-republishing.git`,
          ), // Replace repo, keeping homepage
        "utf-8",
      ),
    );

    await readFile(`./packages/${packageName}/package/README.md`, "utf-8").then((data) =>
      writeFile(
        `./packages/${packageName}/package/README.md`,
        `${extendedReadme}\n\n${data}`, // Inject README Header
        "utf-8",
      ),
    );

    $`cd ./packages/${packageName}/package && npm publish --access public --provenance --dry-run`.pipe(process.stdout);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
