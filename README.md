# 魔塔：失落的旋律（Magic Tower: The Lost Melody）

經典「魔塔」的網頁版。15 層原創關卡、三隻 Boss、中文／English／日本語，手機和電腦的進度可以透過你自己的私有 GitHub repo 同步。

**直接玩**：https://agan0617.github.io/MagicTower/ （Android App 在 [MagicTowerApp](https://github.com/agan0617/MagicTowerApp)）

## 故事

里拉王國是音樂之國。豐收祭那一晚，「靜默指揮家」把全國的歌聲、樂器和聲音都捲進了一座漆黑的高塔——只漏掉了一個人：全國最有名的音痴，鐵匠學徒**小鎚**。

跟著豐收祭之歌的精靈**多蕾**爬上靜默之塔，打倒被變成怪物的樂器，把音樂一樣一樣搶回來。

- **音樂會跟著劇情回來**：一開始塔裡只剩低音和零星的鐘聲；打倒 5F 的鼓魔像，鼓聲回到配樂裡；打倒 10F 的弦之魔女，和聲回來；結局時整首豐收祭之歌全員到齊
- 沿路撿到指揮家的三頁日記，拼出他為什麼要偷走全世界的聲音
- 所有音樂和音效都用 Web Audio 即時合成，沒有任何音檔；美術全是程式裡的像素圖

## 玩法

經典魔塔規則：碰到怪物就開打，戰鬥結果是固定的（勇者先攻，雙方輪流攻擊，直到一方倒下），所以**打之前就知道會損失多少生命**——拿到《怪物圖鑑》後，地圖上每隻怪腳下都會標出代價，紅色代表打不贏。

- 同色鑰匙開同色門；紅寶石＋攻擊、藍寶石＋防禦、藥水補生命
- 4F 與 11F 有祭壇可以用金幣換能力，6F 的呱呱商人賣鑰匙
- 2F 的老吟遊詩人會給你《風之羽》，可以在去過的樓層之間飛行
- 怪物特技：**先攻**（開打前先打你一下）、**魔法**（無視防禦）
- 資源有限，開門和打怪的順序很重要；記得常常存檔（自動存檔＋三格手動存檔）

操作：方向鍵／WASD 移動，也可以直接點地圖上的格子，勇者會自己走過去。`B` 圖鑑、`F` 飛行、`Shift+S` 存讀、`Esc` 選單。手機上用地圖下方的搖桿（在那塊區域任何地方按住拖曳都可以）。

## 手機和電腦同步進度

做法跟 [K書吧](https://github.com/agan0617/KBookBar) 一樣：進度存在**你自己的私有 repo** 裡的 `saves.json`，每台裝置貼一次 GitHub fine-grained token，瀏覽器／App 直接跟 GitHub API 對話，沒有任何中間伺服器。

1. 建一個 **Private** repo（預設名稱 `MagicTowerSave`，勾 Add a README file）
2. 到 GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token：Repository access 只選那個 repo，Permissions 的 **Contents** 設成 **Read and write**
3. 遊戲裡按右上角的 ☁（或標題畫面的「雲端同步」）→ 貼上 token → repo 填 `你的帳號/你的 repo` → 連線

同步規則：自動存檔與三格手動存檔各自比時間，新的贏。每次換樓層、打完 Boss、買東西都會自動存檔並在幾秒內上傳；切走 App 或關掉分頁時也會上傳。打開時如果別台裝置有比較新的進度，會問你要不要讀取。

token 只存在那台裝置的瀏覽器（localStorage）裡；手機弄丟時到 GitHub 把 token 刪掉就好。

## 檔案

| 檔案 | 內容 |
|---|---|
| `js/data.js` | 15 層地圖、怪物、道具、商店、劇本 |
| `js/core.js` | 規則：移動、戰鬥試算、撿道具、開門、劇本的狀態指令（不碰畫面，node 也能跑） |
| `js/sprites.js` | 像素圖（16×16 字元圖，可換色） |
| `js/audio.js` | 音樂與音效合成、分層配樂 |
| `js/i18n.js` | 三語的介面與劇情文字 |
| `js/sync.js` | 本機存檔與 GitHub 同步 |
| `js/main.js` | 畫面、操作、演出、選單 |
| `tools/solve.js` | 平衡檢查：自動玩家從 1F 打到結局，改關卡或數值後跑 `node tools/solve.js` 確認還打得通 |
| `tools/count.js` | 每層的鑰匙／門／寶石數量 |
| `tools/make_icons.py` | 產生圖示 |

改版時記得把 `sw.js` 的 `VERSION` 加一，否則已經開過的瀏覽器會繼續用快取裡的舊檔。
