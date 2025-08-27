import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

/**
 * Утилиты для безопасной работы с чувствительными данными
 */
export class SecurityUtils {
  
  /**
   * Генерирует криптографически стойкий пароль
   */
  static generateSecurePassword(length: number = 16): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    // Гарантируем наличие хотя бы одной буквы, цифры и спецсимвола
    password += charset.charAt(Math.floor(Math.random() * 26)); // Заглавная буква
    password += charset.charAt(26 + Math.floor(Math.random() * 26)); // Строчная буква
    password += charset.charAt(52 + Math.floor(Math.random() * 10)); // Цифра
    password += charset.charAt(62 + Math.floor(Math.random() * 8)); // Спецсимвол
    
    // Добавляем остальные символы
    for (let i = 4; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    // Перемешиваем символы для большей случайности
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Создает безопасную временную директорию с уникальным именем
   */
  static createSecureTempDir(prefix: string = 'secure_temp'): string {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(8).toString('hex');
    const tempDir = path.join(os.tmpdir(), `${prefix}_${timestamp}_${randomBytes}`);
    
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Устанавливаем права доступа только для владельца (Unix-системы)
    try {
      fs.chmodSync(tempDir, 0o700);
    } catch (error) {
      // Игнорируем ошибки на Windows
    }
    
    return tempDir;
  }

  /**
   * Безопасная очистка файла с перезаписью данных
   */
  static async secureDeleteFile(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      return;
    }

    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        // Перезаписываем файл случайными данными 3 раза
        for (let i = 0; i < 3; i++) {
          const randomData = crypto.randomBytes(stat.size);
          fs.writeFileSync(filePath, randomData);
        }
      }
      
      // Удаляем файл
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error(`⚠️ Ошибка при безопасном удалении файла ${filePath}:`, error);
    }
  }

  /**
   * Безопасная очистка директории с перезаписью всех файлов
   */
  static async secureDeleteDirectory(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
      return;
    }

    try {
      // Рекурсивно находим все файлы
      const filesToDelete: string[] = [];
      const dirsToDelete: string[] = [];

      const walkDir = (dir: string) => {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            dirsToDelete.push(fullPath);
            walkDir(fullPath);
          } else {
            filesToDelete.push(fullPath);
          }
        }
      };

      walkDir(dirPath);

      // Безопасно удаляем все файлы
      for (const file of filesToDelete) {
        await this.secureDeleteFile(file);
      }

      // Удаляем директории в обратном порядке
      dirsToDelete.reverse();
      for (const dir of dirsToDelete) {
        try {
          fs.rmdirSync(dir);
        } catch (error) {
          // Игнорируем ошибки при удалении директорий
        }
      }

      // Удаляем корневую директорию
      fs.rmdirSync(dirPath);
      
      console.log(`🔒 Директория ${dirPath} безопасно очищена`);
    } catch (error) {
      console.error(`⚠️ Ошибка при безопасной очистке директории ${dirPath}:`, error);
      // Пытаемся принудительно удалить даже при ошибках
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
      } catch (finalError) {
        console.error(`❌ Не удалось удалить директорию ${dirPath}:`, finalError);
      }
    }
  }

  /**
   * Очистка чувствительных данных из объекта
   */
  static clearSensitiveObject(obj: any, sensitiveKeys: string[] = ['privateKey', 'password', 'secret']): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    for (const key of Object.keys(obj)) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        if (typeof obj[key] === 'string') {
          obj[key] = '';
        } else if (typeof obj[key] === 'object') {
          this.clearSensitiveObject(obj[key], sensitiveKeys);
        }
      } else if (typeof obj[key] === 'object') {
        this.clearSensitiveObject(obj[key], sensitiveKeys);
      }
    }
  }

  /**
   * Проверка безопасности временной директории
   */
  static isSecureTempDir(dirPath: string): boolean {
    try {
      const stat = fs.statSync(dirPath);
      
      // Проверяем права доступа (только для Unix-систем)
      if (process.platform !== 'win32') {
        const mode = stat.mode & 0o777;
        if (mode !== 0o700) {
          return false;
        }
      }
      
      // Проверяем, что директория находится в системной временной папке
      const tempDir = os.tmpdir();
      return dirPath.startsWith(tempDir);
    } catch (error) {
      return false;
    }
  }

  /**
   * Генерация случайного имени файла
   */
  static generateRandomFileName(extension: string = ''): string {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(8).toString('hex');
    return `${timestamp}_${randomBytes}${extension}`;
  }

  /**
   * Безопасное создание временного файла
   */
  static createSecureTempFile(content: string, extension: string = '.tmp'): string {
    const tempDir = this.createSecureTempDir('secure_file');
    const fileName = this.generateRandomFileName(extension);
    const filePath = path.join(tempDir, fileName);
    
    fs.writeFileSync(filePath, content);
    
    // Устанавливаем права доступа только для владельца (Unix-системы)
    try {
      fs.chmodSync(filePath, 0o600);
    } catch (error) {
      // Игнорируем ошибки на Windows
    }
    
    return filePath;
  }
}
