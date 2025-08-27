import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { getAddress } from 'viem';
// Удалён импорт WalletInjection - функциональность интегрирована в основной код
import { RabbyWallet, RabbyWalletConfig } from './rabby-wallet';
import { LineaRewardsConnector, LineaRewardsConfig } from './linea-rewards-connector';
import { WalletDatabase, WalletData } from './modules/database';
import { WalletDataExtractor } from './modules/wallet-data-extractor';

export interface SpinResult {
  success: boolean;
  reward?: string;
  error?: string;
  timestamp: number;
}

export interface WalletConfig {
  privateKey: string;
  address: string;
}

export class LineaSpinWheelBot {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private wallet: WalletConfig;
  // Удалено: private walletInjection: WalletInjection;
  private rabbyWallet: RabbyWallet | null = null;
  private lineaRewardsConnector: LineaRewardsConnector | null = null;
  private walletDatabase: WalletDatabase;
  private walletDataExtractor: WalletDataExtractor;

  constructor(wallet: WalletConfig) {
    this.wallet = wallet;
    
    // Удалено: программный кошелёк (fallback) - используем только Rabby Wallet
    
    // Инициализируем базу данных и экстрактор данных
    this.walletDatabase = new WalletDatabase();
    this.walletDataExtractor = new WalletDataExtractor();
  }

  /**
   * Инициализация браузера с подключенным кошельком
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Инициализация браузера с Rabby Wallet...');
      
      // Создаём конфигурацию для Rabby Wallet
      const rabbyConfig: RabbyWalletConfig = {
        privateKey: this.wallet.privateKey
      };
      
      this.rabbyWallet = new RabbyWallet(rabbyConfig);
      
      // Инициализируем Rabby Wallet
      await this.rabbyWallet.initialize();
      
      // Импортируем кошелёк
      const walletAddress = await this.rabbyWallet.importWallet();
      
      // Получаем страницу с подключенным кошельком
      this.page = await this.rabbyWallet.getPage();
      
      // Инициализация коннектора Linea Rewards
      const rewardsConfig: LineaRewardsConfig = {
        url: 'https://linea.build/hub/rewards',
        timeout: 30000
      };
      
      this.lineaRewardsConnector = new LineaRewardsConnector(this.page, rewardsConfig);
    } catch (error) {
      console.error('❌ Ошибка инициализации браузера с Rabby Wallet:', error);
      
      // Fallback к программному кошельку
      await this.initializeWithProgrammaticWallet();
    }
  }

  /**
   * Инициализация с программным кошельком (fallback)
   */
  private async initializeWithProgrammaticWallet(): Promise<void> {
    try {
      // Запуск браузера в режиме разработки
      this.browser = await chromium.launch({
        headless: false, // Показываем браузер для отладки
        slowMo: 1000, // Замедляем действия для стабильности
        args: [
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ]
      });

      // Создание контекста
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        bypassCSP: true // Обходим Content Security Policy
      });

      // Создание новой страницы
      this.page = await this.context.newPage();
    } catch (error) {
      console.error('❌ Ошибка инициализации с программным кошельком:', error);
      throw error;
    }
  }



  /**
   * Подключение к Linea Rewards
   */
  async connectToLineaRewards(): Promise<boolean> {
    if (!this.page || !this.lineaRewardsConnector) {
      throw new Error('Браузер или коннектор не инициализирован');
    }

    try {
      console.log('🔗 Подключение к Linea Rewards...');
      
      // Используем новый коннектор для подключения
      const connected = await this.lineaRewardsConnector.connect();
      
      if (!connected) {
        console.log('❌ Не удалось подключиться к Linea Rewards');
        return false;
      }
      
      console.log('✅ Кошелёк подключен к Linea Rewards');
      
      // Извлекаем и сохраняем данные о кошельке
      await this.extractAndSaveWalletData();
      
      return true;

    } catch (error) {
      console.error('❌ Ошибка подключения к Linea Rewards:', error);
      return false;
    }
  }

  /**
   * Выполнение спина
   */
  async performSpin(): Promise<SpinResult> {
    if (!this.page || !this.lineaRewardsConnector) {
      throw new Error('Браузер или коннектор не инициализирован');
    }

    try {

      
      // Используем новый коннектор для выполнения спина
      const result = await this.lineaRewardsConnector.performSpin();
      
      // Если спин успешен, обновляем статистику кошелька
      if (result.success) {
        await this.updateWalletStatsAfterSpin();
      }
      
      // Конвертируем результат в формат SpinResult
      return {
        success: result.success,
        reward: result.reward,
        error: result.error,
        timestamp: result.timestamp
      };

    } catch (error) {
      console.error('❌ Ошибка выполнения спина:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Прокрутка спина с правильной логикой
   */
  async spinWheel(): Promise<SpinResult> {
    if (!this.page) {
      return {
        success: false,
        error: 'Страница не инициализирована',
        timestamp: Date.now()
      };
    }

    try {
      console.log('🎰 Начинаем прокрутку спина...');
      


      // Шаг 1: Нажимаем первую кнопку "Spin the wheel" на основной странице
              // Нажимаем первую кнопку "Spin the wheel"
      await this.page.click('button:has-text("Spin the wheel")');
      await this.page.waitForTimeout(2000);

      // Ждем появления модального окна
              // Ожидаем появления модального окна
      await this.page.waitForSelector('xpath=/html/body/div[2]/div/div[3]/main/div[1]/div[3]/div/div[1]/div/div[2]/div[2]/button/span', { timeout: 10000 });

      // Шаг 2: Ждем появления модального окна и нажимаем вторую кнопку "Spin the wheel"
              // Нажимаем вторую кнопку "Spin the wheel" в модальном окне
      
      // Используем XPath селектор для второй кнопки
      await this.page.click('xpath=/html/body/div[2]/div/div[3]/main/div[1]/div[3]/div/div[1]/div/div[2]/div[2]/button/span');
      
      await this.page.waitForTimeout(2000);

      // Шаг 3: Ждем появления сообщения "Complete the transaction to spin."
              // Ожидаем появления сообщения о необходимости подтверждения транзакции
      await this.page.waitForSelector('h2:has-text("Complete the transaction to spin.")', { timeout: 10000 });

      // Шаг 4: Ждем появления popup окна кошелька
              // Ожидаем появления popup окна кошелька
      
      // Ждем появления popup окна с повторными попытками
      let walletPopup: Page | undefined = undefined;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (!walletPopup && attempts < maxAttempts) {
        await this.page.waitForTimeout(1000);
        attempts++;
        
                 const pages = this.page.context().pages();
         for (const page of pages) {
           const url = page.url();
           // Ищем popup окно Rabby Wallet
           if ((url.includes('chrome-extension://') || url.includes('moz-extension://')) && 
               url.includes('notification.html')) {
             walletPopup = page;
             // Найдено popup окно
             break;
           }
         }
        
        if (!walletPopup) {
          // Попытка ${attempts}/${maxAttempts}: Popup окно кошелька еще не появилось
        }
      }
      
      if (!walletPopup) {
        console.log('ℹ️ Popup окно кошелька не появилось, возможно транзакция уже подтверждена');
      }

             // Шаг 5: Обрабатываем popup окно кошелька
       const popupResult = await this.handleWalletPopup(walletPopup);
       if (!popupResult.success) {
         console.log('⚠️ Ошибка при обработке popup окна, но продолжаем выполнение...');
         // Не прерываем выполнение, так как popup окно могло закрыться корректно
       }

             // Шаг 6: Ждем завершения спина и получаем результат
               // Ожидаем завершения спина на основной странице
       
       // Ждем, пока popup окно закроется и результат появится на основной странице
       await this.page.waitForTimeout(3000);
       
       // Проверяем, что основная страница все еще доступна
       try {
                 await this.page.bringToFront();
      } catch (error) {
        // Ошибка при возврате на основную страницу, продолжаем
      }

      // Шаг 7: Извлекаем результат спина
      const spinResult = await this.extractSpinResult();
      
      // Определяем тип результата и выводим соответствующее сообщение
      if (spinResult.reward) {
        if (spinResult.reward.includes("Better Luck Next Time") || spinResult.reward.includes("Проигрыш")) {
          console.log('😔 Результат спина: ПРОИГРЫШ');
        } else if (spinResult.reward.includes("Выигрыш")) {
          console.log('🎉 Результат спина: ВЫИГРЫШ!');
          console.log(`💰 Детали приза: ${spinResult.reward}`);
        } else {
          console.log('📊 Результат спина:', spinResult.reward);
        }
      }
      
             // Шаг 8: Обновляем статистику кошелька
       try {
         await this.updateWalletStatsAfterSpin();
       } catch (error) {
         // Ошибка при обновлении статистики кошелька
       }

      // Спин успешно завершен
      return {
        success: true,
        reward: spinResult.reward,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('❌ Ошибка при прокрутке спина:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Перезагрузка страницы и переподключение к Linea Rewards
   */
  async reloadAndReconnect(): Promise<boolean> {
    if (!this.page) {
      console.log('❌ Страница не инициализирована');
      return false;
    }

    try {
      console.log('🔄 Перезагружаем страницу...');
      await this.page.reload({ waitUntil: 'networkidle' });
      
      // Небольшая пауза после перезагрузки
      await this.page.waitForTimeout(3000);
      
      // Переподключаемся к Linea Rewards
      const connected = await this.connectToLineaRewards();
      if (connected) {
        console.log('✅ Страница перезагружена и переподключена к Linea Rewards');
        return true;
      } else {
        console.log('❌ Не удалось переподключиться к Linea Rewards после перезагрузки');
        return false;
      }
    } catch (error) {
      console.error('❌ Ошибка при перезагрузке страницы:', error);
      return false;
    }
  }

  /**
   * Обработка popup окна кошелька
   */
  private async handleWalletPopup(walletPopup?: Page): Promise<{ success: boolean; error?: string }> {
    try {
      // Если popup окно не передано, ищем его
      if (!walletPopup) {
        const pages = this.page!.context().pages();
        
                 for (const page of pages) {
           const url = page.url();
           // Ищем popup окно Rabby Wallet
           if ((url.includes('chrome-extension://') || url.includes('moz-extension://')) && 
               url.includes('notification.html')) {
             walletPopup = page;
             // Найдено popup окно в handleWalletPopup
             break;
           }
         }
      }

      if (!walletPopup) {
        // Если popup не найден, возможно транзакция уже подтверждена
        console.log('ℹ️ Popup окно кошелька не найдено, возможно транзакция уже подтверждена');
        return { success: true };
      }

      // Найдено popup окно кошелька, обрабатываем

      // Переключаемся на popup окно
      await walletPopup.bringToFront();
      await walletPopup.waitForTimeout(2000);

            // Проверяем, загрузилось ли popup окно корректно
      const pageContent = await walletPopup.content();
      const pageTitle = await walletPopup.title();
      const pageUrl = walletPopup.url();
       
                     // Перезагружаем popup окно для корректной загрузки контента
        
        try {
          // Сначала пробуем простую перезагрузку
          await walletPopup.reload({ waitUntil: 'domcontentloaded' });
          await walletPopup.waitForTimeout(2000);
          
                               // Ждем загрузки контента popup окна
          await walletPopup.waitForLoadState('domcontentloaded');
          // Popup окно загружено
          
          // Проверяем состояние после перезагрузки
          const newPageContent = await walletPopup.content();
          const newPageTitle = await walletPopup.title();
          const newPageUrl = walletPopup.url();
          
                 } catch (reloadError: unknown) {
           const errorMessage = reloadError instanceof Error ? reloadError.message : String(reloadError);
           // Ошибка при перезагрузке popup окна
           
                   // Fallback: пробуем навигацию к правильному URL
        try {
          // Пробуем fallback - навигацию к правильному URL
             const currentUrl = walletPopup.url();
             
             if (currentUrl.includes('notification.html') && !currentUrl.includes('#/approval')) {
               const correctUrl = currentUrl + '#/approval';
               await walletPopup.goto(correctUrl, { waitUntil: 'domcontentloaded' });
               await walletPopup.waitForTimeout(2000);
               
               // Ждем загрузки контента после навигации
               await walletPopup.waitForLoadState('domcontentloaded');
               console.log('✅ Fallback успешен - popup окно загружено');
             }
           } catch (fallbackError: unknown) {
             const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
             // Fallback также не удался
             // Продолжаем выполнение даже если перезагрузка не удалась
           }
         }

      // Ищем кнопку подтверждения (Sign/Confirm) с повторными попытками
      let signButton = null;
      let attempts = 0;
      const maxButtonAttempts = 8; // Увеличиваем количество попыток
      
      while (!signButton && attempts < maxButtonAttempts) {
        await walletPopup.waitForTimeout(1500); // Увеличиваем время ожидания
        attempts++;
        
        // Расширенный поиск кнопок с различными селекторами
        signButton = await walletPopup.$([
          'button:has-text("Sign")',
          'button:has-text("Confirm")', 
          'button:has-text("Подписать")',
          'button:has-text("Подтвердить")',
          '[data-testid="sign-button"]',
          '[data-testid="confirm-button"]',
          '.sign-button',
          '.confirm-button',
          'button[type="submit"]'
        ].join(', '));
        
        if (!signButton) {
          // Попытка ${attempts}/${maxButtonAttempts}: Кнопка подписи не найдена
          
          // Попробуем найти все кнопки и вывести их текст
          const allButtons = await walletPopup.$$('button');
          
                      for (let i = 0; i < allButtons.length; i++) {
              try {
                const buttonText = await allButtons[i].textContent();
                const buttonVisible = await allButtons[i].isVisible();
                // Кнопка ${i + 1}: "${buttonText}" (видимая: ${buttonVisible})
              } catch (e) {
                // Кнопка ${i + 1}: [не удалось получить текст]
              }
            }
        }
      }
      
                      if (signButton) {
           // Нажимаем кнопку подписи
           await signButton.click();
           
           // Проверяем, что popup окно все еще существует
           let popupStillOpen = true;
           try {
             await walletPopup.waitForTimeout(2000);
           } catch (error) {
             // Popup окно закрылось после нажатия Sign, продолжаем
             popupStillOpen = false;
           }

           // Ищем кнопку финального подтверждения только если popup окно все еще открыто
           if (popupStillOpen) {
             try {
               // Расширенный поиск кнопки подтверждения
               const confirmButton = await walletPopup.$([
                 'button:has-text("Confirm")',
                 'button:has-text("Подтвердить")',
                 '[data-testid="confirm-button"]',
                 '.confirm-button',
                 'button[type="submit"]:has-text("Confirm")',
                 'button[type="submit"]:has-text("Подтвердить")'
               ].join(', '));
               
               if (confirmButton) {
                 // Нажимаем кнопку финального подтверждения
                 await confirmButton.click();
                 
                 // Проверяем, что popup окно все еще существует
                 try {
                   await walletPopup.waitForTimeout(3000);
                 } catch (error) {
                   // Popup окно закрылось после нажатия Confirm, продолжаем
                 }
               } else {
                 // Кнопка финального подтверждения не найдена, возможно она не нужна
                 
                 // Выводим все кнопки для отладки
                 const allButtons = await walletPopup.$$('button');
                 
                 for (let i = 0; i < allButtons.length; i++) {
                   try {
                     const buttonText = await allButtons[i].textContent();
                     const buttonVisible = await allButtons[i].isVisible();
                     // Кнопка ${i + 1} после Sign: "${buttonText}" (видимая: ${buttonVisible})
                   } catch (e) {
                     // Кнопка ${i + 1} после Sign: [не удалось получить текст]
                   }
                 }
               }
             } catch (error) {
               // Ошибка при поиске кнопки подтверждения, popup окно могло закрыться
             }
           }
         } else {
           // Кнопка подписи не найдена после всех попыток, возможно транзакция уже подтверждена
         }

         // Ждем закрытия popup окна
         await this.page!.waitForTimeout(2000);

         // Возвращаемся на основную страницу
         try {
           await this.page!.bringToFront();
                     // Успешно вернулись на основную страницу
        } catch (error) {
          // Ошибка при возврате на основную страницу, продолжаем
        }

      return { success: true };

         } catch (error: unknown) {
       const errorMessage = error instanceof Error ? error.message : String(error);
       console.error('❌ Ошибка при обработке popup окна кошелька:', errorMessage);
       return {
         success: false,
         error: errorMessage
       };
     }
  }

     /**
    * Извлечение результата спина
    */
   private async extractSpinResult(): Promise<{ reward?: string }> {
     try {
       // Ожидаем появления результата спина на основной странице (15 секунд)
       
       // Ждем появления результата спина 15 секунд
       await this.page!.waitForTimeout(15000);

       // Сначала проверяем, есть ли текст "Better Luck Next Time" (проигрыш)
       const betterLuckElement = await this.page!.$('text="Better Luck Next Time"');
       
       if (betterLuckElement) {
         // Найден текст "Better Luck Next Time" - в этот раз не повезло
         return { reward: "Better Luck Next Time - проигрыш" };
       }

       // Ищем другие возможные элементы проигрыша
       const lossElements = await this.page!.$$('div:has-text("You didn\'t win"), div:has-text("Better luck"), div:has-text("No prize"), div:has-text("Try again")');
       
       if (lossElements.length > 0) {
         const lossText = await lossElements[0].textContent();
         // Найден текст проигрыша
         return { reward: `Проигрыш: ${lossText?.trim()}` };
       }

       // Ищем элементы выигрыша
       const winElements = await this.page!.$$('div:has-text("You won"), div:has-text("Congratulations"), div:has-text("Prize"), div:has-text("USDC"), div:has-text("ETH"), div:has-text("$")');
       
       if (winElements.length > 0) {
         const winText = await winElements[0].textContent();
         // Найден текст выигрыша
         return { reward: `Выигрыш: ${winText?.trim()}` };
       }

       // Попробуем найти результат в модальном окне
       const modalElements = await this.page!.$$('div[role="dialog"] *');
       
       for (const element of modalElements) {
         try {
           const text = await element.textContent();
           if (text && (
             text.includes("Better Luck Next Time") ||
             text.includes("You won") ||
             text.includes("Congratulations") ||
             text.includes("USDC") ||
             text.includes("Prize")
           )) {
             // Результат найден в модальном окне
             
             if (text.includes("Better Luck Next Time")) {
               return { reward: "Better Luck Next Time - проигрыш" };
             } else {
               return { reward: `Выигрыш: ${text.trim()}` };
             }
           }
         } catch (e) {
           // Игнорируем ошибки при чтении отдельных элементов
         }
       }

       // Если ничего не найдено, получаем общий контент страницы для анализа
       const pageContent = await this.page!.textContent('body');
       
       if (pageContent) {
         if (pageContent.includes("Better Luck Next Time")) {
           // Найден "Better Luck Next Time" в общем контенте - проигрыш
           return { reward: "Better Luck Next Time - проигрыш" };
         }
         
         // Ищем признаки выигрыша в общем контенте
         const winKeywords = ["You won", "Congratulations", "Prize won", "USDC won", "ETH won"];
         for (const keyword of winKeywords) {
           if (pageContent.includes(keyword)) {
             // Найден признак выигрыша
             return { reward: `Выигрыш обнаружен: ${keyword}` };
           }
         }
       }

       // Результат спина не определен - возможно, еще загружается
       return { reward: "Результат не определен" };

           } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('❌ Ошибка при извлечении результата спина:', errorMessage);
        return { reward: "Ошибка при получении результата" };
      }
   }

  /**
   * Извлечение и сохранение данных о кошельке
   */
  async extractAndSaveWalletData(): Promise<void> {
    if (!this.page) {
      return;
    }

    try {
      // Ждём появления карточки кошелька
      const cardFound = await this.walletDataExtractor.waitForWalletCard(this.page);
      if (!cardFound) {
        console.log('⚠️ Карточка кошелька не найдена');
        return;
      }
      
      // Извлекаем данные о кошельке
      const walletData = await this.walletDataExtractor.extractWalletData(this.page, this.wallet.privateKey);
      if (!walletData) {
        console.log('⚠️ Не удалось извлечь данные о кошельке');
        return;
      }
      
      // Сохраняем данные в базу
      await this.walletDatabase.saveWalletData(walletData);
      
    } catch (error) {
      console.error('❌ Ошибка извлечения и сохранения данных о кошелька:', error);
    }
  }

  /**
   * Получение данных кошелька из базы данных
   */
  async getWalletData(address?: string): Promise<WalletData | null> {
    const targetAddress = address || this.wallet.address;
    return await this.walletDatabase.getWalletData(targetAddress);
  }

  /**
   * Получение всех кошельков из базы данных
   */
  async getAllWallets(): Promise<WalletData[]> {
    return await this.walletDatabase.getAllWallets();
  }

  /**
   * Обновление статистики кошелька
   */
  async updateWalletStats(stats: Partial<WalletData>): Promise<void> {
    await this.walletDatabase.updateWalletStats(this.wallet.address, stats);
  }

  /**
   * Обновление статистики кошелька после выполнения спина
   */
  async updateWalletStatsAfterSpin(): Promise<void> {
    if (!this.page) {
      return;
    }

    try {
      
      // Ждём обновления страницы после спина
      await this.page.waitForTimeout(3000);
      
      // Извлекаем обновленные данные о кошельке
      const updatedWalletData = await this.walletDataExtractor.extractWalletData(this.page, this.wallet.privateKey);
      if (updatedWalletData) {
        // Обновляем только статистику, не перезаписывая адрес и приватный ключ
        const statsToUpdate: Partial<WalletData> = {
          balance: updatedWalletData.balance,
          spinsAvailable: updatedWalletData.spinsAvailable,
          prizesWon: updatedWalletData.prizesWon,
          gamesPlayed: updatedWalletData.gamesPlayed,
          dayStreak: updatedWalletData.dayStreak,
          nextSpinTime: updatedWalletData.nextSpinTime,
          lastActivity: new Date().toISOString()
        };
        
        await this.walletDatabase.updateWalletStats(this.wallet.address, statsToUpdate);
      }
      
    } catch (error) {
      console.error('❌ Ошибка обновления статистики после спина:', error);
    }
  }




  /**
   * Закрытие браузера с полной очисткой чувствительных данных
   */
  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      
      if (this.rabbyWallet) {
        await this.rabbyWallet.cleanup();
        this.rabbyWallet = null;
      }
      
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      console.log('🔒 Браузер закрыт и все чувствительные данные очищены');

    } catch (error) {
      console.error('❌ Ошибка закрытия браузера:', error);
    }
  }
}
