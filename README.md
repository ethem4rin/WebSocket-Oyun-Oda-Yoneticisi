# 🚀 Node.js WebSocket Oda Yöneticisi (Casus Kim? Backend Temeli)

Bu proje, Node.js ve WebSocket teknolojilerini kullanarak gerçek zamanlı, çok oyunculu bir oyunun temel iskeletini oluşturur. Özellikle kullanıcıların sanal odalar oluşturmasını ve bu odalara katılarak iletişim kurmasını sağlayan temel ağ (networking) ve oturum yönetimi (session management) üzerine odaklanılmıştır.

Bu proje, popüler sosyal oyun "Casus Kim?" (Spyfall) uygulamasının backend (arka plan) mantığının ilk aşamasıdır. Şu anda sadece **Oda Oluşturma** ve **Odaya Katılma** işlevlerini kararlı bir şekilde yönetmektedir.

## ⚙️ Kullanılan Teknolojiler

* **Node.js:** Sunucu tarafı JavaScript çalışma ortamı. (Tercihen v18.x veya üzeri)
* **WebSocket (ws):** Sunucu ile istemci arasında çift yönlü, anlık iletişim sağlar.
* **UUID:** Benzersiz oyuncu kimlikleri oluşturmak için kullanılır.

## ✨ Temel Özellikler

* **Oda Oluşturma (`createRoom`):** Her yeni oyun için rastgele, benzersiz bir oda kodu üretilir.
* **Odaya Katılma (`joinRoom`):** Oyuncuların, geçerli bir oda kodunu kullanarak oyuna dahil olması.
* **Oyuncu Durum Takibi:** Bağlantı kesintilerini ve oyuncu ayrılmalarını anlık olarak tespit etme ve odadan düşürme mekanizması.
* **Host Devri:** Odanın kurucusu (host) ayrıldığında, odadaki ilk oyuncunun otomatik olarak host yetkisini alması.
* **Hata Yönetimi:** Oda bulunamadığında veya oyun başlamışken katılım denendiğinde istemciye net hata mesajı gönderme.

## 💻 Proje Nasıl Çalıştırılır?

### 1. Dosyaları İndirme

Tüm proje dosyalarını (özellikle `server.js` ve `package.json`) yerel diskinize indirin.

### 2. Kurulum

Proje klasörüne gidin ve gerekli Node.js paketlerini yükleyin:

```bash
npm install
