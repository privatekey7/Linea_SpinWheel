import { chromium, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { SecurityUtils } from './utils/security';

export interface RabbyWalletConfig {
  privateKey: string;
  password?: string;
  extensionPath?: string;
}

export class RabbyWallet {
  private config: RabbyWalletConfig;
  private context: BrowserContext | null = null;
  private extensionId: string | null = null;
  private tempProfile: string | null = null;
  private sessionPassword: string | null = null;

  constructor(config: RabbyWalletConfig) {
    this.config = {
      extensionPath: path.resolve(process.cwd(), 'Rabby-Wallet-Chrome'),
      ...config
    };
  }

  /**
   * Генерирует криптографически стойкий пароль для сеанса
   */
  private generateSecurePassword(): string {
    return SecurityUtils.generateSecurePassword(16);
  }

  /**
   * Создает временную директорию для профиля браузера
   */
  private createTempProfile(): string {
    return SecurityUtils.createSecureTempDir('rabby_import');
  }

  /**
   * Безопасная очистка временной директории с перезаписью данных
   */
  private async secureCleanupTempProfile(tempProfile: string): Promise<void> {
    await SecurityUtils.secureDeleteDirectory(tempProfile);
  }

  /**
   * Очистка чувствительных данных из памяти
   */
  private clearSensitiveData(): void {
    // Очищаем пароль из памяти
    if (this.sessionPassword) {
      this.sessionPassword = null;
    }
    
    // Очищаем чувствительные данные из конфигурации
    SecurityUtils.clearSensitiveObject(this.config, ['privateKey', 'password', 'secret']);
    
    // Очищаем extensionId
    this.extensionId = null;
  }

  /**
   * Инициализация браузера с расширением Rabby
   */
  async initialize(): Promise<void> {
    // Генерируем уникальный пароль для этого сеанса
    this.sessionPassword = this.generateSecurePassword();
    console.log('🔐 Сгенерирован новый безопасный пароль для сеанса');
    
    this.tempProfile = this.createTempProfile();
    
    try {
      // Запуск браузера с расширением
      const chromeArgs = [
        `--disable-extensions-except=${this.config.extensionPath}`,
        `--load-extension=${this.config.extensionPath}`,
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor", // Дополнительная безопасность
        "--disable-dev-shm-usage", // Избегаем использования /dev/shm
        "--no-sandbox", // Только для временных профилей
        "--disable-setuid-sandbox"
      ];
      
      this.context = await chromium.launchPersistentContext(this.tempProfile, {
        headless: false,
        args: chromeArgs,
        ignoreDefaultArgs: ["--disable-extensions"],
        viewport: { width: 1200, height: 800 }
      });
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Поиск расширения
      await this.findExtension();
      
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Поиск и идентификация расширения Rabby
   */
  private async findExtension(): Promise<void> {
    if (!this.context) throw new Error("Контекст браузера не инициализирован");
    
    // Проверяем загрузку расширения до 15 раз (до 45 секунд)
    for (let attempt = 0; attempt < 15; attempt++) {
      // Проверяем все открытые страницы
      const pages = this.context.pages();
      for (const page of pages) {
        const url = page.url();
        if (url.includes("chrome-extension://") && 
            (url.toLowerCase().includes("rabby") || url.includes("index.html"))) {
          this.extensionId = url.split("chrome-extension://")[1].split("/")[0];
          break;
        }
      }
      
      if (this.extensionId) {
        break;
      }
      
      // Если расширение ещё не загрузилось, ждём ещё
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Если всё ещё не найдено - ищем через chrome://extensions/
    if (!this.extensionId) {
      const extPage = await this.context.newPage();
      await extPage.goto("chrome://extensions/");
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      this.extensionId = await extPage.evaluate(() => {
        const items = document.querySelectorAll('extensions-item');
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const name = item.querySelector('#name');
          if (name && name.textContent && name.textContent.toLowerCase().includes('rabby')) {
            const id = item.id.replace('extension-', '');
            return id;
          }
        }
        return null;
      });
      
      await extPage.close();
      
      if (!this.extensionId) {
        throw new Error("Расширение Rabby не найдено");
      }
    }
  }

  /**
   * Импорт кошелька в Rabby
   */
  async importWallet(): Promise<string> {
    if (!this.context || !this.extensionId || !this.sessionPassword) {
      throw new Error("Браузер не инициализирован или пароль не сгенерирован");
    }
    
    // Используем приватный ключ из конфигурации
    const currentKey = this.config.privateKey;
    
    // Используем уже открытую страницу расширения
    const pages = this.context.pages();
    let page = null;
    
    // Ищем уже открытую страницу расширения
    for (const existingPage of pages) {
      const url = existingPage.url();
      if (url.includes("chrome-extension://") && url.includes(this.extensionId)) {
        page = existingPage;
        break;
      }
    }
    
    // Если не нашли открытую страницу, создаём новую
    if (!page) {
      page = await this.context.newPage();
      const setupUrl = `chrome-extension://${this.extensionId}/index.html#/new-user/guide`;
      await page.goto(setupUrl);
    }
    
    // Обязательная перезагрузка страницы для корректной загрузки контента
    await page.reload();
    
    try {
      // Шаг 1: Ждём и кликаем "I already have an address"
      await page.waitForSelector('span:has-text("I already have an address")', { timeout: 30000 });
      await page.click('span:has-text("I already have an address")');
      
      // Шаг 2: Ждём и кликаем выбор "Private Key"
      const privateKeySelector = 'div.rabby-ItemWrapper-rabby--mylnj7:has-text("Private Key")';
      await page.waitForSelector(privateKeySelector, { timeout: 30000 });
      await page.click(privateKeySelector);
      
      // Шаг 3: Ждём поле ввода приватного ключа и вводим ключ
      const privateKeyInput = '#privateKey';
      await page.waitForSelector(privateKeyInput, { timeout: 30000 });
      await page.click(privateKeyInput);
      await page.fill(privateKeyInput, currentKey);
      
      // Шаг 4: Ждём активации кнопки Confirm и кликаем
      const confirmButtonSelector = 'button:has-text("Confirm"):not([disabled])';
      await page.waitForSelector(confirmButtonSelector, { timeout: 30000 });
      await page.click(confirmButtonSelector);
      
      // Шаг 5: Ждём поле ввода пароля и вводим сгенерированный пароль
      const passwordInput = '#password';
      await page.waitForSelector(passwordInput, { timeout: 30000 });
      await page.click(passwordInput);
      await page.fill(passwordInput, this.sessionPassword);
      
      // Переходим на следующее поле подтверждения пароля через Tab
      await page.press(passwordInput, 'Tab');
      await page.keyboard.type(this.sessionPassword);
      
      // Шаг 6: Ждём активации второй кнопки Confirm и кликаем
      const passwordConfirmButton = 'button:has-text("Confirm"):not([disabled])';
      await page.waitForSelector(passwordConfirmButton, { timeout: 30000 });
      await page.click(passwordConfirmButton);
      
      // Шаг 7: Ждём сообщения об успешном импорте
      await page.waitForSelector('text=Imported Successfully', { timeout: 30000 });
      
      // Извлекаем адрес кошелька
      let walletAddress = null;
      try {
        const address = await page.evaluate(() => {
          const text = document.body.textContent;
          if (!text) return null;
          const match = text.match(/0x[a-fA-F0-9]{40}/);
          return match ? match[0] : null;
        });
        if (address) {
          walletAddress = address;
        }
      } catch (error) {
        // Игнорируем ошибки извлечения адреса
      }
      
      await page.close();
      
      return walletAddress || '';
      
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Получение страницы с подключенным кошельком
   */
  async getPage(): Promise<Page> {
    if (!this.context) {
      throw new Error("Браузер не инициализирован");
    }
    
    // Ищем уже открытую страницу с кошельком
    const pages = this.context.pages();
    for (const page of pages) {
      const url = page.url();
      // Возвращаем страницу, которая не является расширением (основная страница)
      if (!url.includes("chrome-extension://") && !url.includes("chrome://")) {
        return page;
      }
    }
    
    // Если не нашли подходящую страницу, создаём новую
    return await this.context.newPage();
  }

  /**
   * Полная очистка ресурсов и чувствительных данных
   */
  async cleanup(): Promise<void> {
    try {
      // Закрываем браузер
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      
      // Очищаем чувствительные данные из памяти
      this.clearSensitiveData();
      
      // Безопасно очищаем временный профиль
      if (this.tempProfile) {
        await this.secureCleanupTempProfile(this.tempProfile);
        this.tempProfile = null;
      }
      
      console.log('🔒 Все ресурсы и чувствительные данные очищены');
    } catch (error) {
      console.error('⚠️ Ошибка при очистке ресурсов:', error);
    }
  }

  /**
   * Закрытие браузера (устаревший метод, используйте cleanup)
   */
  async close(): Promise<void> {
    await this.cleanup();
  }
}
