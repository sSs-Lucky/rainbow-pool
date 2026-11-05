# RainBow Pool · 和朋友来一局

中文、手机横屏的 2D 台球游戏。创建球桌、分享链接，两位玩家无需注册即可对打；也支持单人练球。

[在线体验](https://3000-agq2udpq7t7yj3auet7yeeg4fy.instabox.tech/) · [更新日志](CHANGELOG.md) · [物理模型](PHYSICS.md) · [部署说明](DEPLOY.md) · [参与贡献](CONTRIBUTING.md)

示例部署使用免费云主机，可能休眠或暂时不可用。可以按下文自行部署。

![RainBow Pool 游戏界面](docs/gameplay.jpg)

## 当前功能

- 中文界面，手机横屏布局；桌面鼠标和键盘也可操作。
- 六位房间码与邀请链接，每张球桌最多两位玩家。
- 服务器统一计算物理、球权、自由球和基本八球胜负；支持断线重连及房间存档。
- 可见球杆、左侧独立力度条、右侧角度微调，以及白球击点控制。
- 高低杆、左右塞、滑动/滚动摩擦、球碰球和库边碰撞；袋口斜边参与实际碰撞。
- 稳定的短方向指引，蓄力时不晃动；白球落袋后，对手可反复摆放自由球并确认。
- 联机运动显示补帧、按变化更新记分栏和拥塞时的中间快照限流。

## 快速运行

需要 **Node.js 22.12 或更新版本**，建议使用 `.nvmrc` 指定的 Node.js 22。

```sh
git clone https://github.com/sSs-Lucky/rainbow-pool.git
cd rainbow-pool
npm ci
npm run build
npm start
```

浏览器打开 `http://localhost:3000`。创建房间后，把邀请链接发给能访问该地址的另一位玩家。

手机和朋友通过公网游玩，需要将服务部署到可访问的主机，并配置支持 WebSocket 的 HTTPS 入口。项目包含 Node.js 服务，单独发布 `dist/` 不能提供当前的双人对战。

## 怎么玩

| 操作 | 方法 |
| --- | --- |
| 粗瞄 | 在球桌上点击或拖动，调整击球方向 |
| 精调 | 右侧竖条上下拖动；＋/− 每次调整 0.05° |
| 击球 | 左侧力度条向下拉，松手出杆；推回起点取消 |
| 加塞 | 点击右下白球，拖动红点；支持组合高低杆与左右塞，每杆后自动回中 |
| 方向参考 | 白线指向接触位置，金色短箭头提示目标球的初始方向；不表示完整行程 |
| 自由球 | 获得球权的一方在台面空位点击或反复拖动白球，确认后再出杆 |

当前采用简化八球规则：房主打全色 1–7，访客打花色 9–15，清完本组后打黑 8。白球落袋、先碰错球、未碰球或无有效碰库等情形由服务端判罚。按本项目约定，自由球统一允许全台摆放；没有完整实现比赛中的开球选择、叫球与所有赛事细则。

方向箭头基于固定参考击球求得的初始方向，实际效果仍受力度、加塞及后续碰撞影响。物理是贴台、水平球杆的刚体近似，未模拟抬杆弧线、跳球和球杆弹性；参数未对真实器材标定。详见 [PHYSICS.md](PHYSICS.md)。

## 本地开发

先执行快速运行中的依赖安装与构建。开发时使用两个终端：

```sh
npm start
```

```sh
npm run dev
```

打开 Vite 显示的本地地址（通常为 `http://127.0.0.1:5173`）。Vite 将 `/ws` 和 `/health` 转发到本机 3000 端口的服务端，因此开发模式也能测试邀请对战。Vite 开发服务用于本机调试。

## 检查与测试

```sh
npm test
npm run build
```

启动服务后，执行真实双客户端测试：

```sh
POOL_TEST_URL=http://127.0.0.1:3000 npm run test:network
```

`npm test` 包含 22 项物理、瞄准、规则及显示推演检查；联网测试覆盖双人入座、回合限制、犯规、自由球预摆/确认、房间隔离和断线重连。GitHub Actions 在提交和 Pull Request 时自动运行测试与构建。

## 配置

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `PORT` | `3000` | HTTP/WebSocket 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `POOL_DATA_DIR` | 项目下 `.runtime` | 服务端房间存档目录 |

可通过宿主环境或服务管理器设置变量。也可以复制 `.env.example` 为 `.env`，使用 `node --env-file=.env server.mjs` 启动；普通 `npm start` 不会自动加载 `.env`。

`.runtime` 包含房间状态和席位凭据，已排除在 Git 之外。个人部署记录使用本地 `deployment.json`，公开仓库只提供 `deployment.example.json`。存档格式当前为物理版本 3；未来物理格式升级可能需要重摆旧球桌。

## 项目结构

```text
src/main.js          游戏循环、输入与客户端状态
src/scene.js         PixiJS 绘制与方向指引
src/aiming.js        接触位置与初始方向参考
src/physics.js       共享物理求解器
src/geometry.js      绘制与碰撞共用的库边、袋口几何
src/shot-rules.js    服务端使用的击球判罚
src/playback.js      联机快照之间的显示推演
src/net.js          同源 WebSocket 与重连
server.mjs          HTTP、房间、权威状态和存档
public/sfx/         音效及来源声明
test/               单元、物理、规则与联网测试
deploy/             通用部署模板
```

## 开源与致谢

本项目基于 [Arel Kair / Pool](https://github.com/arelkair/pool) 二次开发，上游基准提交为 `f1c0017e219d72bb7c7f1c75bd7db9d3c6d88a88`。保留原作者版权与 [MIT LICENSE](LICENSE)。改造内容包括中文手机操控、服务器统一对战、旋转与摩擦、袋口几何、自由球和稳定方向指引等；来源与变更范围见 [UPSTREAM.md](UPSTREAM.md)。

音效使用上游记录的 CC0 资源，来源声明保留在 [public/sfx/CREDITS.txt](public/sfx/CREDITS.txt)。界面中的球桌、球杆、球体和控件由项目代码绘制，未包含商业台球小游戏的截图、贴图或品牌资产。
