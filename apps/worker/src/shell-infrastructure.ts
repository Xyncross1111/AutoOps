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
    buildEnvironment?: Record<string, string>;
    baseImages?: string[];
    maxAttempts?: number;
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
    containerPort: number;
    networkName: string;
    runtimeEnvironment?: Record<string, string>;
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
    const cloneLabel = `git clone ${args.owner}/${args.repo}`;
    const fetchLabel = `git fetch ${args.owner}/${args.repo}@${args.commitSha.slice(0, 12)}`;

    await this.execWithRetry(
      async () => {
        await rm(workdir, { recursive: true, force: true });
        await mkdir(workdir, { recursive: true });
        await this.exec("git", ["clone", "--no-checkout", remote, workdir], {
          onOutput: args.onOutput
        });
      },
      {
        label: cloneLabel,
        maxAttempts: 3,
        onOutput: args.onOutput,
        shouldRetry: isTransientGitError,
        retryDescription: "git/network error"
      }
    );
    await this.execWithRetry(
      async () => {
        await this.exec(
          "git",
          ["-C", workdir, "fetch", "--depth", "1", "origin", args.commitSha],
          { onOutput: args.onOutput }
        );
      },
      {
        label: fetchLabel,
        maxAttempts: 3,
        onOutput: args.onOutput,
        shouldRetry: isTransientGitError,
        retryDescription: "git/network error"
      }
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
    buildEnvironment?: Record<string, string>;
    baseImages?: string[];
    maxAttempts?: number;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<void> {
    const maxAttempts = args.maxAttempts ?? 3;
    const buildEnvironmentEntries = sortEnvironmentEntries(args.buildEnvironment);
    let buildEnvironmentPath: string | null = null;

    for (const baseImage of args.baseImages ?? []) {
      await this.execWithRetry(
        async () => {
          await args.onOutput?.(`Pulling base image ${baseImage}.`);
          await this.exec("docker", ["pull", baseImage], {
            onOutput: args.onOutput
          });
        },
        {
          label: `docker pull ${baseImage}`,
          maxAttempts,
          onOutput: args.onOutput,
          shouldRetry: isTransientContainerRegistryError,
          retryDescription: "registry/network error"
        }
      );
    }

    try {
      if (buildEnvironmentEntries.length > 0) {
        buildEnvironmentPath = join(tmpdir(), `autoops-build-env-${randomUUID()}.sh`);
        await writeFile(
          buildEnvironmentPath,
          buildEnvironmentEntries
            .map(([name, value]) => `export ${name}=${shellQuote(value)}`)
            .join("\n"),
          "utf8"
        );
        await args.onOutput?.(
          `Passing ${buildEnvironmentEntries.length} managed environment variable${
            buildEnvironmentEntries.length === 1 ? "" : "s"
          } into the image build.`
        );
      }

      await this.execWithRetry(
        async () => {
          const buildArgs = [
            "build",
            ...(buildEnvironmentPath
              ? ["--secret", `id=autoops_build_env,src=${buildEnvironmentPath}`]
              : []),
            "-f",
            args.dockerfile,
            "-t",
            args.localTag,
            args.context
          ];
          await this.exec("docker", buildArgs, {
            cwd: args.workdir,
            env: {
              DOCKER_BUILDKIT: "1"
            },
            onOutput: args.onOutput
          });
        },
        {
          label: `docker build ${args.localTag}`,
          maxAttempts,
          onOutput: args.onOutput,
          shouldRetry: isTransientContainerRegistryError,
          retryDescription: "registry/network error"
        }
      );
    } finally {
      if (buildEnvironmentPath) {
        await rm(buildEnvironmentPath, { force: true });
      }
    }
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
      const composeFileArgs = [
        "-f",
        shellQuote(args.composeFile),
        "-f",
        shellQuote(remoteOverridePath)
      ];
      const composePullCommand = `if command -v docker-compose >/dev/null 2>&1; then docker-compose ${composeFileArgs.join(" ")} pull ${shellQuote(
        args.service
      )}; else docker compose ${composeFileArgs.join(" ")} pull ${shellQuote(
        args.service
      )}; fi`;
      const composeUpCommand = `if command -v docker-compose >/dev/null 2>&1; then docker-compose ${composeFileArgs.join(" ")} up -d ${shellQuote(
        args.service
      )}; else docker compose ${composeFileArgs.join(" ")} up -d ${shellQuote(
        args.service
      )}; fi`;
      const remoteCommand = [
        composePullCommand,
        composeUpCommand,
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
    containerPort: number;
    networkName: string;
    runtimeEnvironment?: Record<string, string>;
    managedDomain?: string | null;
    edgeContainerName?: string | null;
    onOutput?: (line: string) => Promise<void> | void;
  }): Promise<void> {
    const runtimeEnvironmentLines = buildComposeEnvironmentLines(args.runtimeEnvironment);

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
        "    ports:",
        `      - \"${args.publicPort}:${args.containerPort}\"`,
        ...runtimeEnvironmentLines,
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

    await this.runComposeCommand(
      [
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
          `  reverse_proxy ${args.appSlug}:${args.containerPort}`,
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

  private async runComposeCommand(
    args: string[],
    options: ExecOptions = {}
  ): Promise<void> {
    try {
      await this.exec("docker-compose", args, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("spawn docker-compose ENOENT") ||
        message.includes("not found")
      ) {
        await this.exec("docker", ["compose", ...args], options);
        return;
      }
      throw error;
    }
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

  private async execWithRetry(
    action: () => Promise<void>,
    args: {
      label: string;
      maxAttempts: number;
      onOutput?: (line: string) => Promise<void> | void;
      shouldRetry: (message: string) => boolean;
      retryDescription: string;
    }
  ): Promise<void> {
    let attempt = 0;

    while (attempt < args.maxAttempts) {
      attempt += 1;
      try {
        await action();
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const shouldRetry = attempt < args.maxAttempts && args.shouldRetry(message);
        if (!shouldRetry) {
          throw error;
        }

        await args.onOutput?.(
          `${args.label} hit a transient ${args.retryDescription}. Retrying (${attempt + 1}/${args.maxAttempts})...`
        );
        await sleep(attempt * 2000);
      }
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

function isTransientContainerRegistryError(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    "failed to authorize",
    "network is unreachable",
    "tls handshake timeout",
    "i/o timeout",
    "temporary failure",
    "timeout",
    "connection reset by peer"
  ].some((fragment) => normalized.includes(fragment));
}

function isTransientGitError(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    "could not resolve host",
    "temporary failure in name resolution",
    "network is unreachable",
    "connection timed out",
    "operation timed out",
    "failed to connect",
    "connection reset by peer",
    "tls handshake timeout",
    "http/2 stream",
    "the remote end hung up unexpectedly"
  ].some((fragment) => normalized.includes(fragment));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function sortEnvironmentEntries(environment?: Record<string, string>) {
  return Object.entries(environment ?? {}).sort(([left], [right]) => left.localeCompare(right));
}

function buildComposeEnvironmentLines(environment?: Record<string, string>) {
  const entries = sortEnvironmentEntries(environment);

  if (entries.length === 0) {
    return [];
  }

  return [
    "    environment:",
    ...entries.map(([name, value]) => `      ${JSON.stringify(name)}: ${JSON.stringify(value)}`)
  ];
}
