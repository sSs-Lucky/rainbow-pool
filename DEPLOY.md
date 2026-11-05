# 部署 RainBow Pool

项目需要长期运行的 Node.js 进程，同时提供 HTTP 和同源 `/ws` WebSocket。静态托管 `dist/` 不能提供当前双人对战服务。

## 构建与启动

需要 Node.js 22.12+。以下命令在项目根目录执行：

```sh
npm ci
npm test
npm run build
npm start
```

默认监听 `0.0.0.0:3000`。健康检查为 `GET /health`；对外入口应将普通请求及 WebSocket 升级请求转发给此进程。推荐由宿主平台或反向代理提供 HTTPS。

## 配置与存档

- `PORT`：默认 3000。
- `HOST`：默认 0.0.0.0；由同机反向代理转发时可以设为 127.0.0.1。
- `POOL_DATA_DIR`：房间存档目录，默认项目内 .runtime。更新代码时应保留该目录，或使用独立持久目录。

使用环境变量、宿主平台配置或 systemd EnvironmentFile 设置变量。`.env.example` 可以复制为 `.env` 后通过 `node --env-file=.env server.mjs` 使用；普通 npm start 不自动读取该文件。

个人部署记录存于不提交的 deployment.json，格式示例见 deployment.example.json。存档含席位凭据，不作为静态资源提供，也不上传 GitHub。

## Linux 服务示例

[deploy/rainbow-pool.service](deploy/rainbow-pool.service) 是 systemd 模板：假定代码位于 /srv/rainbow-pool，以已有的 pool 系统账号运行。部署者需按实际情况调整账号、工作目录及 Node.js 的绝对路径；用 `command -v node` 确认路径。`StateDirectory` 创建独立存档目录。

按机器配置安装并启用服务；更新代码、构建完成后重启该服务。InstaBox 等平台也可以使用其提供的进程管理器。免费主机的休眠、连续运行时长和冷却限制由平台管理，源码发布不改变这些限制。

[deploy/nginx.conf.example](deploy/nginx.conf.example) 给出同源反向代理示例；更换域名和端口，并使用平台或现有证书方案配置 HTTPS。模板的 map 和 server 应放在 Nginx 的 http 上下文中。

## 验证

```sh
curl --fail http://127.0.0.1:3000/health
POOL_TEST_URL=http://127.0.0.1:3000 npm run test:network
```

再用两台设备验证公网邀请链接、换权、自由球摆放与确认、断线重连。网络测试会创建独立测试房间；执行期间服务必须可用。

## 更新与回退

先备份房间存档及当前发布版本，再取得已经通过 CI 的标签/提交，执行依赖安装、测试、构建和服务重启。发布记录包含版本号及提交 SHA。运行中的房间格式当前为物理版本 3；改变存档或物理字段时需要明确迁移策略。

回退时恢复上一版本代码并重新安装/构建；必要时配合该版本兼容的存档备份。不要在更新脚本中清空持久数据目录，也不要将备份放进公开静态目录。
