import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readlineSync from 'readline-sync';

/**
 * Утилита для шифрования и расшифровки приватных ключей
 */
export class KeyEncryption {
  private static readonly ALGORITHM = 'aes-256-cbc';
  private static readonly ENCRYPTED_FILE = 'keys.encrypted';
  private static readonly SALT_FILE = 'keys.salt';

  /**
   * Создание ключа шифрования из пароля и соли
   */
  private static deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  }

  /**
   * Шифрование приватных ключей
   */
  static encryptKeys(privateKeys: string[], password: string): void {
    try {
      // Генерируем соль
      const salt = crypto.randomBytes(32);
      
      // Создаем ключ из пароля
      const key = this.deriveKey(password, salt);
      
      // Создаем IV
      const iv = crypto.randomBytes(16);
      
      // Объединяем ключи в одну строку
      const keysData = privateKeys.join('\n');
      
      // Шифруем данные используя современный API
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
      let encrypted = cipher.update(keysData, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Сохраняем зашифрованные данные
      const encryptedData = iv.toString('hex') + ':' + encrypted;
      fs.writeFileSync(this.ENCRYPTED_FILE, encryptedData);
      
      // Сохраняем соль
      fs.writeFileSync(this.SALT_FILE, salt.toString('hex'));
    } catch (error) {
      console.error('❌ Ошибка шифрования:', error);
      throw error;
    }
  }

  /**
   * Расшифровка приватных ключей
   */
  static decryptKeys(password: string): string[] {
    try {
      // Проверяем наличие файлов
      if (!fs.existsSync(this.ENCRYPTED_FILE) || !fs.existsSync(this.SALT_FILE)) {
        throw new Error('Зашифрованные файлы не найдены');
      }
      
      // Читаем соль
      const saltHex = fs.readFileSync(this.SALT_FILE, 'utf8');
      const salt = Buffer.from(saltHex, 'hex');
      
      // Создаем ключ из пароля
      const key = this.deriveKey(password, salt);
      
      // Читаем зашифрованные данные
      const encryptedData = fs.readFileSync(this.ENCRYPTED_FILE, 'utf8');
      const [ivHex, encrypted] = encryptedData.split(':');
      
      if (!ivHex || !encrypted) {
        throw new Error('Неверный формат зашифрованных данных');
      }
      
      const iv = Buffer.from(ivHex, 'hex');
      
      // Расшифровываем данные используя современный API
      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Разбиваем на отдельные ключи
      const privateKeys = decrypted.split('\n').filter(key => key.trim());
      
      return privateKeys;
    } catch (error) {
      // Не выводим технические детали ошибки для лучшего UX
      throw new Error('Неверный пароль');
    }
  }

  /**
   * Проверка наличия зашифрованных ключей
   */
  static hasEncryptedKeys(): boolean {
    return fs.existsSync(this.ENCRYPTED_FILE) && fs.existsSync(this.SALT_FILE);
  }

  /**
   * Проверка наличия открытых ключей
   */
  static hasPlainKeys(): boolean {
    return fs.existsSync('keys.txt');
  }

  /**
   * Безопасный интерактивный ввод пароля (скрытый)
   */
  static async promptPassword(message: string = 'Enter password to decrypt keys: '): Promise<string> {
    return new Promise((resolve) => {
      const password = readlineSync.question(message, {
        hideEchoBack: true, // Скрываем ввод пароля
        mask: '*' // Показываем звездочки вместо символов
      });
      resolve(password);
    });
  }

  /**
   * Интерактивный ввод пароля с подтверждением (скрытый)
   */
  static async promptPasswordWithConfirmation(): Promise<string> {
    const password = await this.promptPassword('Enter password for encryption: ');
    const confirmPassword = await this.promptPassword('Confirm password: ');
    
    if (password !== confirmPassword) {
      throw new Error('Пароли не совпадают');
    }
    
    if (password.length < 6) {
      throw new Error('Пароль должен содержать минимум 6 символов');
    }
    
    return password;
  }

  /**
   * Миграция открытых ключей в зашифрованные
   */
  static async migratePlainKeys(): Promise<void> {
    if (!this.hasPlainKeys()) {
      console.log('ℹ️ Файл keys.txt не найден');
      return;
    }

    // Читаем открытые ключи
    const keysPath = path.join(process.cwd(), 'keys.txt');
    const content = fs.readFileSync(keysPath, 'utf8');
    const lines = content.split('\n');
    const privateKeys: string[] = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        let privateKey = trimmedLine;
        if (!privateKey.startsWith('0x')) {
          privateKey = '0x' + privateKey;
        }
        if (/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
          privateKeys.push(privateKey);
        }
      }
    }

    if (privateKeys.length === 0) {
      throw new Error('Не найдено валидных приватных ключей в файле keys.txt');
    }

    // Запрашиваем пароль и шифруем
    const password = await this.promptPasswordWithConfirmation();
    this.encryptKeys(privateKeys, password);
  }
}
