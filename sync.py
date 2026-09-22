"""
SRV Integral — Sincronizador de precios y stock con MercadoLibre
Corre via GitHub Actions cada 6 horas (configurable)
"""

import requests
import json
import os
import sys
from datetime import datetime

# ── CONFIGURACIÓN ──────────────────────────────────────────────
ML_TOKEN        = os.environ.get('ML_TOKEN', '')          # Token OAuth de ML
JSONBIN_ID      = os.environ.get('JSONBIN_ID', '69f0afd2aaba882197494b20')
JSONBIN_KEY     = os.environ.get('JSONBIN_KEY', '$2a$10$wj625wbIzbwgbLLeDvfQAOGwipbo5anqaT1AhrKSpbmcHyKL6hvqm')
ML_BASE         = 'https://api.mercadolibre.com'
BATCH_SIZE      = 20   # ML permite hasta 20 items por request
# ───────────────────────────────────────────────────────────────

def get_catalog():
    """Descargar catálogo desde JSONBin"""
    r = requests.get(
        f'https://api.jsonbin.io/v3/b/{JSONBIN_ID}/latest',
        headers={'X-Master-Key': JSONBIN_KEY}
    )
    r.raise_for_status()
    data = r.json()
    catalog = data.get('record', [])
    if isinstance(catalog, dict):
        catalog = catalog.get('catalogo', [])
    print(f"📦 Catálogo cargado: {len(catalog)} productos")
    return catalog

def save_catalog(catalog):
    """Guardar catálogo actualizado en JSONBin"""
    r = requests.put(
        f'https://api.jsonbin.io/v3/b/{JSONBIN_ID}',
        headers={
            'Content-Type': 'application/json',
            'X-Master-Key': JSONBIN_KEY
        },
        json=catalog
    )
    r.raise_for_status()
    print(f"✅ Catálogo guardado: {len(catalog)} productos")

def get_ml_items(ids):
    """Consultar precios y stock de múltiples items en ML"""
    headers = {'Accept': 'application/json'}
    if ML_TOKEN:
        headers['Authorization'] = f'Bearer {ML_TOKEN}'
    
    ids_str = ','.join(ids)
    r = requests.get(
        f'{ML_BASE}/items?ids={ids_str}',
        headers=headers
    )
    if r.status_code != 200:
        print(f"⚠️  Error ML: {r.status_code}")
        return []
    return r.json()

def sync():
    print(f"\n🔄 Iniciando sincronización — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"🔑 Token ML: {'✅ configurado' if ML_TOKEN else '❌ no configurado'}")

    catalog = get_catalog()
    if not catalog:
        print("❌ Catálogo vacío")
        sys.exit(1)

    updated = 0
    paused  = 0
    errors  = 0

    # Procesar en batches de 20
    ml_ids = [p['ml_id'] for p in catalog if p.get('ml_id')]
    
    for i in range(0, len(ml_ids), BATCH_SIZE):
        batch_ids = ml_ids[i:i+BATCH_SIZE]
        print(f"  Procesando {i+1}–{min(i+BATCH_SIZE, len(ml_ids))} de {len(ml_ids)}...")
        
        items = get_ml_items(batch_ids)
        
        for entry in items:
            if entry.get('code') != 200:
                errors += 1
                continue
            
            item = entry.get('body', {})
            ml_id = item.get('id')
            
            # Buscar en catálogo
            product = next((p for p in catalog if p.get('ml_id') == ml_id), None)
            if not product:
                continue
            
            new_price = item.get('price', 0)
            new_stock = item.get('available_quantity', 0)
            ml_status = item.get('status', 'active')  # active, paused, closed
            
            changed = False
            
            # Actualizar precio si cambió
            if new_price and new_price != product.get('price_ml'):
                old = product.get('price_ml', 0)
                markup = product.get('markup', 30)
                product['price_ml']  = new_price
                product['price_srv'] = round(new_price * (1 + markup / 100), 2)
                print(f"  💰 {ml_id}: ${old:,.0f} → ${new_price:,.0f}")
                changed = True
            
            # Actualizar stock
            if new_stock != product.get('available_qty'):
                product['available_qty'] = new_stock
                changed = True
            
            # Si ML lo pausó o cerró, ocultarlo en la tienda
            if ml_status in ('paused', 'closed') and product.get('visible'):
                product['visible'] = False
                print(f"  ⏸  {ml_id}: pausado en ML → ocultado en tienda")
                paused += 1
                changed = True
            
            if changed:
                product['updated_at'] = datetime.now().isoformat()
                updated += 1

    print(f"\n📊 Resumen:")
    print(f"  Actualizados: {updated}")
    print(f"  Pausados:     {paused}")
    print(f"  Errores:      {errors}")

    save_catalog(catalog)
    print("✅ Sincronización completada\n")

if __name__ == '__main__':
    sync()
