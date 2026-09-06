/* ==========================================================================
   Pawfect Bites — script.js
   ใช้ร่วมกันทุกหน้า (index / product / order / admin)
   แต่ละ init function จะเช็ค element ก่อนทำงาน — หน้าไหนไม่มี element ที่เกี่ยวข้อง
   ก็จะข้ามไปเฉยๆ ไม่ error
   ========================================================================== */

const MOOD_LABELS = {
  all: 'ทั้งหมด',
  skin: 'Skin & Coat',
  digestive: 'Digestive Care',
  energy: 'Energy Boost',
  relax: 'Relax & Calming'
};

// TODO: แก้เป็น URL ของ Apps Script Web App ที่ deploy ไว้สำหรับรับออเดอร์ (ดู doPost)
const ORDER_ENDPOINT_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';

// TODO: แก้เป็น URL CSV ของ Google Sheet ที่ Publish to web แล้ว (File > Share > Publish to web > CSV)
const ORDERS_CSV_URL = 'PASTE_YOUR_PUBLISHED_SHEET_CSV_URL_HERE';

document.addEventListener('DOMContentLoaded', () => {
  initProductPage();
  initOrderForm();
  initAdminTable();
});

async function initProductPage() {
  const filterBar = document.getElementById('filter-bar');
  const productList = document.getElementById('product-list');

  if (!filterBar || !productList) return; // ไม่ใช่หน้า product.html ไม่ต้องทำอะไร

  let products = [];
  try {
    const response = await fetch('products.json');
    products = await response.json();
  } catch (error) {
    productList.innerHTML = '<p class="empty-state">ไม่สามารถโหลดรายการสินค้าได้ในขณะนี้</p>';
    return;
  }

  const initialMood = new URLSearchParams(window.location.search).get('mood') || 'all';

  renderFilterBar(filterBar, initialMood, (mood) => {
    setActiveFilterButton(filterBar, mood);
    renderProductList(productList, products, mood);
    syncMoodToUrl(mood);
  });

  renderProductList(productList, products, initialMood);
}

function renderFilterBar(filterBar, activeMood, onSelectMood) {
  filterBar.innerHTML = '';

  Object.keys(MOOD_LABELS).forEach((mood) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--outline btn--sm filter-btn';
    button.textContent = MOOD_LABELS[mood];
    button.dataset.mood = mood;

    if (mood === activeMood) {
      button.classList.add('is-active');
    }

    button.addEventListener('click', () => onSelectMood(mood));
    filterBar.appendChild(button);
  });
}

function setActiveFilterButton(filterBar, activeMood) {
  filterBar.querySelectorAll('.filter-btn').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mood === activeMood);
  });
}

function syncMoodToUrl(mood) {
  const url = new URL(window.location.href);

  if (mood === 'all') {
    url.searchParams.delete('mood');
  } else {
    url.searchParams.set('mood', mood);
  }

  window.history.pushState({}, '', url);
}

function renderProductList(productList, products, mood) {
  const filtered = mood === 'all'
    ? products
    : products.filter((product) => product.mood === mood);

  productList.innerHTML = '';

  if (filtered.length === 0) {
    productList.innerHTML = '<p class="empty-state">ยังไม่มีสินค้าในหมวดนี้</p>';
    return;
  }

  filtered.forEach((product) => {
    productList.appendChild(createProductCard(product));
  });
}

function createProductCard(product) {
  const card = document.createElement('article');
  card.className = 'card product-card';

  const imageWrap = document.createElement('div');
  imageWrap.className = 'product-card__image';

  const img = document.createElement('img');
  img.src = product.image;
  img.alt = product.name;
  imageWrap.appendChild(img);

  const body = document.createElement('div');
  body.className = 'product-card__body';

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.dataset.mood = product.mood;
  badge.textContent = MOOD_LABELS[product.mood] || product.mood;

  const title = document.createElement('h3');
  title.textContent = product.size ? `${product.name} (${product.size})` : product.name;

  const description = document.createElement('p');
  description.textContent = product.description;

  const price = document.createElement('p');
  price.className = 'product-card__price';
  price.textContent = `฿${product.price}`;

  const orderLink = document.createElement('a');
  orderLink.className = 'btn btn--cta btn--sm';
  orderLink.textContent = 'สั่งซื้อ';
  const itemLabel = product.size ? `${product.name} (${product.size})` : product.name;
  const orderParams = new URLSearchParams({
    items: itemLabel,
    total: product.price
  });
  orderLink.href = `order.html?${orderParams.toString()}`;

  body.appendChild(badge);
  body.appendChild(title);
  body.appendChild(description);
  body.appendChild(price);
  body.appendChild(orderLink);

  card.appendChild(imageWrap);
  card.appendChild(body);

  return card;
}

/* --------------------------------------------------------------------------
   order.html — ฟอร์มสั่งซื้อ (#orderForm)
   items / total เป็น readonly: เติมค่าอัตโนมัติจาก query string
   เช่น order.html?items=...&total=... (ลิงก์มาจากปุ่ม "สั่งซื้อ" ของสินค้า)
   -------------------------------------------------------------------------- */
function initOrderForm() {
  const form = document.getElementById('orderForm');
  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const itemsField = document.getElementById('items');
  const totalField = document.getElementById('total');

  if (itemsField && params.has('items')) {
    itemsField.value = params.get('items');
  }
  if (totalField && params.has('total')) {
    totalField.value = params.get('total');
  }

  form.addEventListener('submit', handleOrderSubmit);
}

async function handleOrderSubmit(event) {
  event.preventDefault();

  const orderData = {
    customerName: document.getElementById('customerName').value,
    contact: document.getElementById('contact').value,
    items: document.getElementById('items').value,
    total: document.getElementById('total').value,
    note: document.getElementById('note').value
  };

  try {
    // mode: 'no-cors' เพราะ Apps Script Web App ไม่ส่ง CORS header กลับมา
    // เราจึงอ่าน response ไม่ได้ (opaque) แต่ request จะไปถึงและถูกบันทึกฝั่ง Sheet ตามปกติ
    await fetch(ORDER_ENDPOINT_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(orderData)
    });
  } catch (error) {
    // ส่งไม่สำเร็จ (เช่น ยังไม่ได้แก้ ORDER_ENDPOINT_URL หรือเน็ตหลุด) — ยังพาไปหน้าขอบคุณตามปกติ
  }

  window.location.href = 'thankyou.html';
}

/* --------------------------------------------------------------------------
   admin.html — ตารางออเดอร์ (#ordersTable)
   ดึง CSV จาก Google Sheet ที่ Publish to web แล้ว มาแสดงใน tbody
   -------------------------------------------------------------------------- */
async function initAdminTable() {
  const table = document.getElementById('ordersTable');
  if (!table) return;

  const tbody = table.querySelector('tbody');

  try {
    const response = await fetch(ORDERS_CSV_URL);
    const csvText = await response.text();
    const rows = parseCsv(csvText).filter((row) => row.some((cell) => cell !== ''));

    // แถวแรกของ CSV คือหัวคอลัมน์จาก Google Sheet เอง (ไม่ใช่ข้อมูลออเดอร์) ข้ามไป
    const dataRows = rows.slice(1);

    tbody.innerHTML = '';

    if (dataRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">ยังไม่มีคำสั่งซื้อ</td></tr>';
      return;
    }

    dataRows.forEach((row) => {
      const tr = document.createElement('tr');
      row.forEach((cell) => {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="6">ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้ในขณะนี้</td></tr>';
  }
}

// CSV parser เล็กๆ รองรับฟิลด์ที่มี comma/ขึ้นบรรทัดใหม่ครอบด้วย double quote
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
