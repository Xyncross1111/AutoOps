import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  onOutput?: (line: string) => Promise<void> | void;
}

export interface ExecutionInfrastructure {
  cloneRepository(args: {
    owner: string;
    repo: string;
    commitSha: string;
    token: string;
    baseTempDir: string;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<string>;
  readFile(path: string): Promise<string>;
  buildImage(args: {
    workdir: string;
    context: string;
    dockerfile: string;
    localTag: string;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<void>;
  runTestCommands(args: {
    imageTag: string;
    commands: string[];
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<void>;
  pushImage(args: {
    baseImage: string;
    localTag: string;
    versionTag: string;
    username: string;
    token: string;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<{ imageRef: string; imageDigest: string }>;
  deployComposeTarget(args: {
    host: string;
    user: string;
    privateKey: string;
    port?: number;
    composeFile: string;
    service: string;
    imageRef: string;
    imageDigest: string;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<void>;
  inspectImageId(args: {
    imageTag: string;
  }): Promise<string>;
  deployManagedTarget(args: {
    appSlug: string;
    runtimeDir: string;
    composeFile: string;
    service: string;
    imageTag: string;
    publicPort: number;
    networkName: string;
    managedDomain?: string | null;
    edgeContainerName?: string | null;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<void>;
  waitForHealthcheck(args: {
    url: string;
    timeoutSeconds?: number;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<void>;
  cleanupPath(path: string): Promise<void>;
}

export class ShellExecutionInfrastructure implements ExecutionInfrastructure {
  async cloneRepository(args: {
    owner: string;
    repo: string;
    commitSha: string;
    token: string;
    baseTempDir: string;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<string> {
    await mkdir(resolve(args.baseTempDir), { recursive: true });
    const workdir = await mkdtemp(join(resolve(args.baseTempDir), "run-"));
    const remote = `https://x-access-token:${args.token}@github.com/${args.owner}/${args.repo}.git`;
    await this.exec("git", ["clone", "--no-checkout", remote, workdir], {
      onOutput: args.onOutput
    });
    await this.exec(
      "git",
      ["-C", workdir, "fetch", "--depth", "1", "origin", args.commitSha],
      { onOutput: args.onOutput }
    );
    await this.exec(
      "git",
      ["-C", workdir, "checkout", "--detach", args.commitSha],
      { onOutput: args.onOutput }
    );
    return workdir;
  }

  async readFile(path: string): Promise<string> {
    return readFile(path, "utf8");
  }

  async buildImage(args: {
    workdir: string;
    context: string;
    dockerfile: string;
    localTag: string;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<void> {
    await this.exec(
      "docker",
      [
        "build",
        "-f",
        args.dockerfile,
        "-t",
        args.localTag,
        args.context
      ],
      {
        cwd: args.workdir,
        onOutput: args.onOutput
      }
    );
  }

  async runTestCommands(args: {
    imageTag: string;
    commands: string[];
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<void> {
    await this.exec(
      "docker",
      [
        "run",
        "--rm",
        "--entrypoint",
        "sh",
        args.imageTag,
        "-lc",
        args.commands.join(" && ")
      ],
      {
        onOutput: args.onOutput
      }
    );
  }

  async pushImage(args: {
    baseImage: string;
    localTag: string;
    versionTag: string;
    username: string;
    token: string;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<{ imageRef: string; imageDigest: string }> {
    await this.exec(
      "docker",
      ["login", "ghcr.io", "-u", args.username, "--password-stdin"],
      {
        stdin: args.token,
        onOutput: args.onOutput
      }
    );
    await this.exec("docker", ["tag", args.localTag, args.versionTag], {
      onOutput: args.onOutput
    });
    await this.exec("docker", ["push", args.versionTag], {
      onOutput: args.onOutput
    });
    const inspect = await this.exec(
      "docker",
      ["inspect", "--format={{index .RepoDigests 0}}", args.versionTag]
    );
    const digestRef = inspect.trim();
    const [, imageDigest] = digestRef.split("@");
    if (!imageDigest) {
      throw new Error("Unable to resolve pushed image digest.");
    }
    return {
      imageRef: args.baseImage,
      imageDigest
    };
  }

  async deployComposeTarget(args: {
    host: string;
    user: string;
    privateKey: string;
    port?: number;
    composeFile: string;
    service: string;
    imageRef: string;
    imageDigest: string;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<void> {
    const keyPath = join(tmpdir(), `autoops-key-${randomUUID()}`);
    const overridePath = join(tmpdir(), `autoops-override-${randomUUID()}.yml`);
    const remoteOverridePath = `/tmp/autoops-${randomUUID()}.override.yml`;
    const fullImage = `${args.imageRef}@${args.imageDigest}`;
    try {
      await writeFile(keyPath, args.privateKey, { mode: 0o600 });
      await writeFile(
        overridePath,
        [
          "services:",
          `  ${args.service}:`,
          `    image: ${fullImage}`
        ].join("\n"),
        "utf8"
      );
      const port = String(args.port ?? 22);
      await this.exec(
        "scp",
        [
          "-i",
          keyPath,
          "-P",
          port,
          "-o",
          "StrictHostKeyChecking=accept-new",
          overridePath,
          `${args.user}@${args.host}:${remoteOverridePath}`
        ],
        { onOutput: args.onOutput }
      );
      const remoteCommand = [
        `docker compose -f ${shellQuote(args.composeFile)} -f ${shellQuote(
          remoteOverridePath
        )} pull ${shellQuote(args.service)}`,
        `docker compose -f ${shellQuote(args.composeFile)} -f ${shellQuote(
          remoteOverridePath
        )} up -d ${shellQuote(args.service)}`,
        `rm -f ${shellQuote(remoteOverridePath)}`
      ].join(" && ");
      await this.exec(
        "ssh",
        [
          "-i",
          keyPath,
          "-p",
          port,
          "-o",
          "StrictHostKeyChecking=accept-new",
          `${args.user}@${args.host}`,
          remoteCommand
        ],
        { onOutput: args.onOutput }
      );
    } finally {
      await rm(keyPath, { force: true });
      await rm(overridePath, { force: true });
    }
  }

  async inspectImageId(args: { imageTag: string }): Promise<string> {
    const output = await this.exec("docker", ["image", "inspect", args.imageTag, "--format={{.Id}}"]);
    return output.trim();
  }

  async deployManagedTarget(args: {
    appSlug: string;
    runtimeDir: string;
    composeFile: string;
    service: string;
    imageTag: string;
    publicPort: number;
    networkName: string;
    managedDomain?: string | null;
    edgeContainerName?: string | null;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<void> {
    await mkdir(args.runtimeDir, { recursive: true });
    await this.ensureDockerNetwork(args.networkName, args.onOutput);
    await writeFile(
      args.composeFile,
      [
        "services:",
        `  ${args.service}:`,
        `    container_name: autoops-${args.appSlug}`,
        `    image: ${args.imageTag}`,
        "    restart: unless-stopped",
        "    environment:",
        '      NODE_ENV: "production"',
        '      HOSTNAME: "0.0.0.0"',
        '      PORT: "3000"',
        "    ports:",
        `      - \"${args.publicPort}:3000\"`,
        "    networks:",
        `      ${args.networkName}:`,
        "        aliases:",
        `          - ${args.appSlug}`,
        "",
        "networks:",
        `  ${args.networkName}:`,
        "    external: true"
      ].join("\n"),
      "utf8"
    );

    await this.exec(
      "docker",
      [
        "compose",
        "-p",
        `autoops-${args.appSlug}`,
        "-f",
        args.composeFile,
        "up",
        "-d",
        "--remove-orphans"
      ],
      { onOutput: args.onOutput }
    );

    if (args.managedDomain && args.edgeContainerName) {
      const sitesDir = join(resolve(args.runtimeDir, "..", ".."), "caddy", "sites");
      const snippetPath = join(sitesDir, `${args.appSlug}.caddy`);
      await mkdir(sitesDir, { recursive: true });
      await writeFile(
        snippetPath,
        [
          `${args.managedDomain} {`,
          `  reverse_proxy ${args.appSlug}:3000`,
          "}"
        ].join("\n"),
        "utf8"
      );
      await this.exec(
        "docker",
        [
          "exec",
          args.edgeContainerName,
          "caddy",
          "reload",
          "--config",
          "/etc/caddy/Caddyfile"
        ],
        { onOutput: args.onOutput }
      );
    }
  }

  async waitForHealthcheck(args: {
    url: string;
    timeoutSeconds?: number;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<void> {
    const timeoutMs = (args.timeoutSeconds ?? 60) * 1000;
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await fetch(args.url);
        if (response.ok) {
          await args.onOutput?.(`Healthcheck passed: ${args.url}`);
          return;
        }
      } catch {
        // Retry until timeout.
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 3000));
    }
    throw new Error(`Healthcheck timed out for ${args.url}`);
  }

  async cleanupPath(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }

  private async ensureDockerNetwork(
    networkName: string,
    onOutput?: (line: string) => Promise<void> | void
  ): Promise<void> {
    try {
      await this.exec("docker", ["network", "inspect", networkName], { onOutput });
    } catch {
      await this.exec("docker", ["network", "create", networkName], { onOutput });
    }
  }

  private async exec(
    command: string,
    args: string[],
    options: ExecOptions = {}
  ): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: {
          ...process.env,
          ...options.env
        },
        stdio: ["pipe", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      const handleChunk = async (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stdout += text;
        if (options.onOutput) {
          for (const line of text.split(/\r?\n/).filter(Boolean)) {
            await options.onOutput(line);
          }
        }
      };
      const handleErrChunk = async (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stderr += text;
        if (options.onOutput) {
          for (const line of text.split(/\r?\n/).filter(Boolean)) {
            await options.onOutput(line);
          }
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        void handleChunk(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        void handleErrChunk(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolvePromise(stdout || stderr);
        } else {
          reject(
            new Error(
              `${command} ${args.join(" ")} failed with exit code ${code}: ${
                stderr || stdout
              }`
            )
          );
        }
      });

      if (options.stdin) {
        child.stdin.write(options.stdin);
      }
      child.stdin.end();
    });
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
