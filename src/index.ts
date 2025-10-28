import { readFile, writeFile, mkdir, rm } from "node:fs/promises";

import { PackumentVersion } from "@npm/types";
import { gt } from "semver";
import { $ } from "zx";
import ky from "ky";
import { extract } from "tar";

async function main() {
  await rm("./packages", { recursive: true, force: true });
  await mkdir("./packages/source", { recursive: true });

  const extendedReadme = await readFile("./EXT.md", "utf-8");

  for await (const packageName of ["v4-core", "v4-periphery"]) {
    await mkdir(`./packages/${packageName}`, { recursive: true });

    const [latestSourceManifest, latestRepublishedManifest] = await Promise.all([
      ky.get(`https://registry.npmjs.org/@uniswap/${packageName}/latest`).json<PackumentVersion>(),
      ky.get(`https://registry.npmjs.org/${packageName}/latest`).json<PackumentVersion>(),
    ]);

    if (gt(latestSourceManifest.version, latestRepublishedManifest.version)) {
      await ky
        .get(latestSourceManifest.dist.tarball)
        .then((e) => e.arrayBuffer())
        .then((e) => writeFile(`./packages/source/${packageName}.tgz`, Buffer.from(e)));

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

      await $`cd ./packages/${packageName}/package && npm publish --access public`.pipe(process.stdout);
    } else {
      console.log(
        `Skipping @uniswap/${packageName}, republished version ${latestRepublishedManifest.version} is up-to-date with source version ${latestSourceManifest.version}.`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
