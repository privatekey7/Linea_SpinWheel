import { Page } from 'playwright';

export interface LineaRewardsConfig {
  url: string;
  timeout?: number;
}

export class LineaRewardsConnector {
  private config: LineaRewardsConfig;
  private page: Page;

  constructor(page: Page, config: LineaRewardsConfig) {
    this.page = page;
    this.config = {
      timeout: 30000,
      ...config
    };
  }

  /**
   * Подключение к Linea Rewards
   */
  async connect(): Promise<boolean> {
    try {
      // Переход на сайт Linea Rewards
      await this.page.goto(this.config.url, {
        waitUntil: 'networkidle'
      });

      // Ожидание загрузки страницы
      await this.page.waitForTimeout(3000);

      // Проверяем, подключен ли уже кошелёк
      const isConnected = await this.checkWalletConnection();
      
      if (isConnected) {
        return true;
      }

      // Подключаем кошелёк
      await this.connectWallet();

      // Проверяем подключение после попытки подключения
      await this.page.waitForTimeout(5000);
      const finalConnection = await this.checkWalletConnection();
      
      if (!finalConnection) {
        return false;
      }

      return true;

    } catch (error) {
      console.error('❌ Ошибка подключения к Linea Rewards:', error);
      return false;
    }
  }

  /**
   * Проверка подключения кошелька
   */
  private async checkWalletConnection(): Promise<boolean> {
    try {
      // Проверяем наличие кнопки подключения - если её нет, значит кошелёк уже подключен
      const connectButton = await this.page.$('button:has-text("Connect Wallet")') ||
                           await this.page.$('button:has-text("Connect")');
      
      if (!connectButton) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Ошибка проверки подключения кошелька:', error);
      return false;
    }
  }

  /**
   * Подключение кошелька через Rabby Wallet
   */
  private async connectWallet(): Promise<void> {
    try {
      // Нажимаем кнопку подключения кошелька
      const connectButton = await this.page.$('button:has-text("Connect Wallet")') ||
                           await this.page.$('button:has-text("Connect")');

      if (connectButton) {
        await connectButton.click();
      }

      // Ожидание появления модального окна подключения
      await this.page.waitForTimeout(2000);

      // Нажимаем "View all wallets" для поиска Rabby
      const viewAllButton = await this.page.$('button:has-text("View all wallets")');
      if (viewAllButton) {
        await viewAllButton.click();
        await this.page.waitForTimeout(1000);
      }

      // Ищем поле поиска и вводим "rabby"
      const searchInput = await this.page.$('input[placeholder*="search"], input[type="search"], [data-testid="Search"]');
      if (searchInput) {
        await searchInput.click();
        await searchInput.fill('rabby');
        await this.page.waitForTimeout(1000);
      }

      // Ищем и нажимаем на кнопку Rabby Wallet
      const rabbyButton = await this.page.$('button:has-text("Rabby")');
      if (rabbyButton) {
        await rabbyButton.click();
        
        // Ожидание появления popup окна расширения
        await this.page.waitForTimeout(3000);
        
        // Получаем все страницы (включая popup)
        const pages = this.page.context().pages();
        
        // Ищем popup окно расширения Rabby
        let popupPage = null;
        for (const page of pages) {
          const url = page.url();
          if (url.includes('chrome-extension://') && (url.includes('rabby') || url.includes('notification.html'))) {
            popupPage = page;
            break;
          }
        }
        
                 if (popupPage) {
           // Переключаемся на popup окно
           try {
             await popupPage.bringToFront();
           } catch (error) {
             // Игнорируем ошибки переключения
           }
           
           // Перезагружаем popup окно для корректной работы
           try {
             await popupPage.reload();
             await popupPage.waitForTimeout(2000); // Простое ожидание вместо networkidle
           } catch (error) {
             // Игнорируем ошибки перезагрузки
           }
            
                         // Ждём появления кнопки подключения и её активации
             let connectWalletButton = null;
             try {
               // Ждём появления кнопки с XPath селектором (максимум 30 секунд)
               connectWalletButton = await popupPage.waitForSelector(
                 'xpath=//*[@id="root"]/div/div/div/div/div[2]/div/div[2]/button[1]/span',
                 { timeout: 30000 }
                               );
               
               // Ждём, пока кнопка станет активной (не disabled)
               await popupPage.waitForFunction(
                 () => {
                   const button = document.evaluate(
                     '//*[@id="root"]/div/div/div/div/div[2]/div/div[2]/button[1]',
                     document,
                     null,
                     XPathResult.FIRST_ORDERED_NODE_TYPE,
                     null
                   ).singleNodeValue as HTMLButtonElement;
                   return button && !button.disabled && button.offsetParent !== null;
                 },
                 { timeout: 10000 }
               );
               
             } catch (error) {
               connectWalletButton = null;
             }
          
                     if (connectWalletButton) {
             await connectWalletButton.click();
             
             // Ожидание завершения подключения (popup может закрыться)
             try {
               // Проверяем, что страница всё ещё существует
               if (!popupPage.isClosed()) {
                 await popupPage.waitForTimeout(3000);
               }
             } catch (error) {
               // Игнорируем ошибки
             }
             
             // Проверяем, закрылось ли popup окно
             try {
               if (!popupPage.isClosed()) {
                 await popupPage.waitForTimeout(1000);
               }
             } catch (error) {
               // Игнорируем ошибки
             }
              
              // Ждём появления нового popup окна для подписи
              await this.page.waitForTimeout(2000);
              
              // Получаем все страницы (включая новое popup)
              const pagesAfterConnect = this.page.context().pages();
              
              // Ищем новое popup окно расширения Rabby
              let signPopupPage = null;
              for (const page of pagesAfterConnect) {
                const url = page.url();
                if (url.includes('chrome-extension://') && (url.includes('rabby') || url.includes('notification.html'))) {
                  signPopupPage = page;
                  break;
                }
              }
              
              if (signPopupPage) {
                // Переключаемся на новое popup окно
                try {
                  await signPopupPage.bringToFront();
                } catch (error) {
                  // Игнорируем ошибки переключения
                }
                
                // Перезагружаем popup окно для корректной работы
                try {
                  await signPopupPage.reload();
                  await signPopupPage.waitForTimeout(2000);
                } catch (error) {
                  // Игнорируем ошибки перезагрузки
                }
                
                // Ждём появления кнопки подписи и её активации
                let signButton = null;
                try {
                  // Ждём появления кнопки подписи с XPath селектором (максимум 30 секунд)
                  signButton = await signPopupPage.waitForSelector(
                    'xpath=//*[@id="root"]/div/footer/div/section/div[2]/div/button',
                    { timeout: 30000 }
                                     );
                   
                   // Ждём, пока кнопка станет активной (не disabled)
                   await signPopupPage.waitForFunction(
                     () => {
                       const button = document.evaluate(
                         '//*[@id="root"]/div/footer/div/section/div[2]/div/button',
                         document,
                         null,
                         XPathResult.FIRST_ORDERED_NODE_TYPE,
                         null
                       ).singleNodeValue as HTMLButtonElement;
                       return button && !button.disabled && button.offsetParent !== null;
                     },
                     { timeout: 10000 }
                   );
                   
                 } catch (error) {
                   signButton = null;
                 }
                
                                 if (signButton) {
                   await signButton.click();
                   
                   // Ожидание появления кнопки Confirm после подписи
                   await signPopupPage.waitForTimeout(2000);
                   
                   // Ждём появления кнопки Confirm и её активации
                   let confirmButton = null;
                   try {
                     // Ждём появления кнопки Confirm с XPath селектором (максимум 30 секунд)
                     confirmButton = await signPopupPage.waitForSelector(
                       'xpath=//*[@id="root"]/div/footer/div/section/div[2]/div/button[1]',
                       { timeout: 30000 }
                     );
                     
                     // Ждём, пока кнопка станет активной (не disabled)
                     await signPopupPage.waitForFunction(
                       () => {
                         const button = document.evaluate(
                           '//*[@id="root"]/div/footer/div/section/div[2]/div/button[1]',
                           document,
                           null,
                           XPathResult.FIRST_ORDERED_NODE_TYPE,
                           null
                         ).singleNodeValue as HTMLButtonElement;
                         return button && !button.disabled && button.offsetParent !== null;
                       },
                       { timeout: 10000 }
                     );
                     
                   } catch (error) {
                     confirmButton = null;
                   }
                   
                   if (confirmButton) {
                     await confirmButton.click();
                     
                     // Ожидание завершения подтверждения (popup может закрыться)
                     try {
                       await signPopupPage.waitForTimeout(3000);
                     } catch (error) {
                       // Игнорируем ошибки
                     }
                     
                     // Проверяем, закрылось ли popup окно подтверждения
                     try {
                       await signPopupPage.waitForTimeout(1000);
                     } catch (error) {
                       // Игнорируем ошибки
                     }
                   }
                 }
              }
              
              // Возвращаемся на основную страницу
              await this.page.bringToFront();
           }
        }
      }

      // Дополнительное ожидание для завершения процесса подключения
      await this.page.waitForTimeout(3000);

    } catch (error) {
      console.error('❌ Ошибка подключения кошелька:', error);
      throw error;
    }
  }



  /**
   * Выполнение спина
   */
  async performSpin(): Promise<{ success: boolean; reward?: string; error?: string; timestamp: number }> {
    try {
      console.log('🎰 Прокручиваем рулетку...');

      // Поиск кнопки спина
      const spinButton = await this.page.$('button:has-text("Spin")') ||
                        await this.page.$('button:has-text("SPIN")') ||
                        await this.page.$('.spin-button') ||
                        await this.page.$('[data-testid="spin-button"]');

      if (!spinButton) {
        throw new Error('Кнопка спина не найдена');
      }

      // Проверяем, доступен ли спин
      const isDisabled = await spinButton.isDisabled();
      if (isDisabled) {
        return {
          success: false,
          error: 'Спин недоступен (возможно, уже использован сегодня)',
          timestamp: Date.now()
        };
      }

      // Нажимаем кнопку спина
      await spinButton.click();

      // Ожидание анимации спина
      await this.page.waitForTimeout(5000);

      // Обработка транзакции
      await this.handleSpinTransaction();

      // Ожидание завершения спина
      await this.page.waitForTimeout(3000);

      // Получение результата
      const result = await this.getSpinResult();

      return result;

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
   * Обработка транзакции спина
   */
  private async handleSpinTransaction(): Promise<void> {
    try {
      // Ждём завершения процесса
      await this.page.waitForTimeout(5000);

    } catch (error) {
      console.error('❌ Ошибка обработки транзакции:', error);
    }
  }

  /**
   * Получение результата спина
   */
  private async getSpinResult(): Promise<{ success: boolean; reward?: string; error?: string; timestamp: number }> {
    try {
      // Поиск элемента с результатом
      const resultSelectors = [
        '[data-testid="spin-result"]',
        '.spin-result',
        '.reward-amount',
        '[data-testid="reward"]'
      ];

      for (const selector of resultSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text && text.trim()) {
            return {
              success: true,
              reward: text.trim(),
              timestamp: Date.now()
            };
          }
        }
      }

      // Если результат не найден, проверяем на ошибки
      const errorSelectors = [
        '[data-testid="error-message"]',
        '.error-message',
        '.alert-error'
      ];

      for (const selector of errorSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text && text.trim()) {
            return {
              success: false,
              error: text.trim(),
              timestamp: Date.now()
            };
          }
        }
      }

      return {
        success: false,
        error: 'Результат спина не найден',
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Ошибка получения результата',
        timestamp: Date.now()
      };
    }
  }
}
