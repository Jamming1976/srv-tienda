"""
sync_ml_firebase.py
Sincroniza precio y stock de MercadoLibre → Firebase Realtime Database.
Corre via GitHub Actions (cron cada 6 horas) o manualmente.

Variables de entorno requeridas:
  ML_TOKEN      — Bearer token de MercadoLibre (OAuth)
  FIREBASE_URL  — https://srvfullcommerce-default-rtdb.firebaseio.com
  FIREBASE_AUTH — secret de Firebase
"""

import os, json, time, urllib.request, urllib.error

ML_TOKEN     = os.environ["ML_TOKEN"]
FIREBASE_URL = os.environ.get("FIREBASE_URL", "https://srvfullcommerce-default-rtdb.firebaseio.com")
FIREBASE_AUTH = os.environ["FIREBASE_AUTH"]

HEADERS_ML = {
    "Authorization": f"Bearer {ML_TOKEN}",
    "User-Agent": "SRV-Tienda-Sync/1.0",
}
BATCH = 20   # ML permite hasta 20 IDs por llamada multiget

def fb_get(path):
    url = f"{FIREBASE_URL}/{path}.json?auth={FIREBASE_AUTH}"
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.loads(r.read())

def fb_patch(path, data):
    url = f"{FIREBASE_URL}/{path}.json?auth={FIREBASE_AUTH}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method="PATCH",
          headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def ml_multiget(ids):
    """Devuelve dict {id: {price, available_quantity, status}} para hasta 20 IDs."""
    ids_str = ",".join(ids)
    url = f"https://api.mercadolibre.com/items?ids={ids_str}&attributes=id,price,available_quantity,status"
    req = urllib.request.Request(url, headers=HEADERS_ML)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            rows = json.loads(r.read())
        result = {}
        for row in rows:
            if row.get("code") == 200:
                b = row["body"]
                result[b["id"]] = {
                    "price": b.get("price", 0),
                    "available_quantity": b.get("available_quantity", 0),
                    "status": b.get("status", ""),
                }
        return result
    except Exception as e:
        print(f"  [ML error] {e}")
        return {}

def main():
    print("=== Sync ML → Firebase ===")

    # 1. Leer catálogo de Firebase
    tienda = fb_get("tienda_productos") or {}
    skus = list(tienda.keys())
    print(f"  Productos en Firebase: {len(skus)}")

    updated = 0
    hidden  = 0
    errors  = 0

    # 2. Procesar en batches de 20
    for i in range(0, len(skus), BATCH):
        batch_ids = skus[i:i+BATCH]
        ml_data = ml_multiget(batch_ids)
        time.sleep(0.3)  # pequeña pausa para no saturar la API

        for sku in batch_ids:
            item = tienda[sku]
            ml  = ml_data.get(sku)

            if not ml:
                print(f"  {sku}: no se obtuvo dato de ML")
                errors += 1
                continue

            # Si ML pausó o cerró el ítem, desactivar en Firebase
            if ml["status"] in ("paused", "closed", "under_review"):
                if item.get("activo", True):
                    try:
                        fb_patch(f"tienda_productos/{sku}", {"activo": False})
                        print(f"  {sku}: ocultado (status ML={ml['status']})")
                        hidden += 1
                    except Exception as e:
                        print(f"  {sku}: error ocultando — {e}")
                        errors += 1
                continue

            new_price_base = round(ml["price"], 2)
            new_stock      = ml["available_quantity"]

            # Actualizar price_base en tienda_productos
            updates_tienda = {}
            if item.get("price_base") != new_price_base:
                updates_tienda["price_base"] = new_price_base

            if updates_tienda:
                try:
                    fb_patch(f"tienda_productos/{sku}", updates_tienda)
                except Exception as e:
                    print(f"  {sku}: error actualizando precio — {e}")
                    errors += 1
                    continue

            # Actualizar stock en /productos/{sku}/
            try:
                fb_patch(f"productos/{sku}", {"available_quantity": new_stock})
            except Exception as e:
                print(f"  {sku}: error actualizando stock — {e}")
                errors += 1
                continue

            print(f"  {sku}: precio=${new_price_base} stock={new_stock}")
            updated += 1

    print(f"\n=== Resultado ===")
    print(f"  Actualizados: {updated}")
    print(f"  Ocultados:    {hidden}")
    print(f"  Errores:      {errors}")

if __name__ == "__main__":
    main()
