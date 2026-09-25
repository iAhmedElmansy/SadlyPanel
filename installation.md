# Updating an existing SPanel install

> New installs should use the one-line installer instead — see [README.md](README.md).
>
> ```bash
> bash <(curl -sSL https://raw.githubusercontent.com/iAhmedElmansy/SadlyPanel/main/installer.sh)
> ```
>
> The installer's **Update** option does everything on this page for you. Keep this
> runbook for the times you need to drive the steps by hand.

> **Never paste a real node token into a file you commit.** Every `<TOKEN_ID>` and
> `<TOKEN>` below is a placeholder — copy the real pair from
> **Admin → Nodes → your node → Configuration** at the moment you run the command.

---

## Update the panel and daemon

```bash
cd /var/www/SPanel

# 1. Pull the new code
git pull

# 2. Install dependencies (devDependencies are needed to build)
npm install

# 3. Apply schema changes to the database
npm run db:push

# 4. Build both workspaces
npm run build

# 5. Restart the services
sudo systemctl restart spanel-panel
sudo systemctl restart spanel-daemon
```

## Re-register a node after rotating its token

```bash
sudo bash scripts/install-daemon.sh \
  --panel http://localhost:3110 \
  --token-id <TOKEN_ID> \
  --token <TOKEN> \
  --port 8282
```

## Service management

```bash
sudo systemctl status spanel-panel
sudo systemctl status spanel-daemon
sudo systemctl restart spanel-panel
sudo systemctl restart spanel-daemon

journalctl -u spanel-panel -f     # follow panel logs
journalctl -u spanel-daemon -f    # follow daemon logs

tail -f /var/log/spanel/panel.log
tail -f /var/log/spanel/daemon.log
```

---

# تحديث نسخة SPanel مثبّتة

> للتثبيت الجديد استخدم أمر التثبيت التلقائي بدلاً من هذه الخطوات — راجع [README.md](README.md):
>
> ```bash
> bash <(curl -sSL https://raw.githubusercontent.com/iAhmedElmansy/SadlyPanel/main/installer.sh)
> ```
>
> خيار **Update** داخل المثبّت ينفّذ كل ما في هذه الصفحة تلقائياً.

> **لا تضع توكن حقيقي داخل أي ملف يُرفع على Git.** كل `<TOKEN_ID>` و `<TOKEN>` هنا
> قيم بديلة — انسخ القيم الحقيقية من **Admin → Nodes → العقدة → Configuration** وقت
> تنفيذ الأمر فقط.

## خطوات التحديث

```bash
cd /var/www/SPanel

# 1. جلب التغييرات
git pull

# 2. تثبيت الحزم (مع devDependencies للبناء)
npm install

# 3. تطبيق تغييرات الـschema على قاعدة البيانات
npm run db:push

# 4. بناء البانل والـdaemon
npm run build

# 5. إعادة تشغيل الخدمات
sudo systemctl restart spanel-panel
sudo systemctl restart spanel-daemon
```

## إعادة ربط عقدة بعد تدوير التوكن

```bash
sudo bash scripts/install-daemon.sh \
  --panel http://localhost:3110 \
  --token-id <TOKEN_ID> \
  --token <TOKEN> \
  --port 8282
```
