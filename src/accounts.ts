import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface Account {
  alias: string;
  email: string;
  authenticated: boolean;
}

export interface AccountConfig {
  alias: string;
  email: string;
}

interface Config {
  accounts: AccountConfig[];
}

const CONFIG_DIR = path.join(os.homedir(), ".gmail-mcp");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const ACCOUNTS_DIR = path.join(CONFIG_DIR, "accounts");

export class AccountManager {
  private config: Config = { accounts: [] };

  constructor() {
    this.ensureDirectories();
    this.loadConfig();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (!fs.existsSync(ACCOUNTS_DIR)) {
      fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
    }
  }

  private loadConfig(): void {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      this.config = JSON.parse(content);
    }
  }

  private saveConfig(): void {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
  }

  getAccountDir(alias: string): string {
    return path.join(ACCOUNTS_DIR, alias);
  }

  getCredentialsPath(alias: string): string {
    return path.join(this.getAccountDir(alias), "credentials.json");
  }

  isAuthenticated(alias: string): boolean {
    return fs.existsSync(this.getCredentialsPath(alias));
  }

  listAccounts(): Account[] {
    return this.config.accounts.map((acc) => ({
      ...acc,
      authenticated: this.isAuthenticated(acc.alias),
    }));
  }

  getAccount(aliasOrEmail: string): AccountConfig | undefined {
    return this.config.accounts.find(
      (acc) => acc.alias === aliasOrEmail || acc.email === aliasOrEmail
    );
  }

  addAccount(alias: string, email: string): void {
    const existing = this.config.accounts.findIndex(
      (acc) => acc.alias === alias
    );
    if (existing >= 0) {
      this.config.accounts[existing] = { alias, email };
    } else {
      this.config.accounts.push({ alias, email });
    }

    // Create account directory
    const accountDir = this.getAccountDir(alias);
    if (!fs.existsSync(accountDir)) {
      fs.mkdirSync(accountDir, { recursive: true });
    }

    this.saveConfig();
  }

  removeAccount(alias: string): boolean {
    const index = this.config.accounts.findIndex((acc) => acc.alias === alias);
    if (index >= 0) {
      this.config.accounts.splice(index, 1);
      this.saveConfig();

      // Remove credentials
      const accountDir = this.getAccountDir(alias);
      if (fs.existsSync(accountDir)) {
        fs.rmSync(accountDir, { recursive: true });
      }
      return true;
    }
    return false;
  }

  getOAuthKeysPath(): string {
    return path.join(CONFIG_DIR, "oauth-keys.json");
  }
}
