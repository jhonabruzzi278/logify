-- ============================================================
-- Logify - Stored Procedures / Functions PostgreSQL
-- Ejecutar después de crear tablas:
-- docker exec -i logify-db psql -U postgres < stored-procedures.sql
-- ============================================================

-- ============================================================
-- orders_db
-- ============================================================
\c orders_db

-- SP 1: Reporte de órdenes con datos del cliente (JOIN orders + customers)
-- Uso: SELECT * FROM fn_get_orders_with_customer();
--      SELECT * FROM fn_get_orders_with_customer('CREATED');
CREATE OR REPLACE FUNCTION fn_get_orders_with_customer(p_status TEXT DEFAULT NULL)
RETURNS TABLE(
  order_id       INT,
  customer_name  VARCHAR,
  customer_email VARCHAR,
  sku            VARCHAR,
  quantity       INT,
  status         VARCHAR,
  created_at     TIMESTAMP,
  assigned_to    VARCHAR
) AS $$
BEGIN
  RETURN QUERY
    SELECT o.id,
           COALESCE(c.name, 'Sin cliente'),
           COALESCE(c.email, ''),
           o.sku,
           o.quantity,
           o.status,
           o.created_at,
           o.assigned_to
    FROM   orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    WHERE  p_status IS NULL OR o.status = p_status
    ORDER  BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- SP 2: Cancelar orden de forma atómica y retornar el registro actualizado
-- Uso: SELECT * FROM fn_cancel_order(1, 'Solicitud del cliente');
CREATE OR REPLACE FUNCTION fn_cancel_order(p_order_id INT, p_reason TEXT DEFAULT '')
RETURNS SETOF orders AS $$
BEGIN
  UPDATE orders
  SET    status        = 'CANCELADO',
         cancel_reason = p_reason
  WHERE  id = p_order_id
  AND    status <> 'CANCELADO';

  RETURN QUERY
    SELECT * FROM orders WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- inventory_db
-- ============================================================
\c inventory_db

-- SP 3: Ajuste de stock con validación (evita stock negativo)
-- Retorna: (sku, new_stock, delta, success, error_msg)
-- Uso: SELECT * FROM fn_adjust_stock('COCA-2L', -5);
CREATE OR REPLACE FUNCTION fn_adjust_stock(p_sku TEXT, p_delta INT)
RETURNS TABLE(
  sku_out   TEXT,
  new_stock INT,
  delta     INT,
  success   BOOLEAN,
  error_msg TEXT
) AS $$
DECLARE
  v_new_stock INT;
  v_exists    BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM inventory WHERE sku = p_sku) INTO v_exists;

  IF NOT v_exists THEN
    RETURN QUERY SELECT p_sku, NULL::INT, p_delta, FALSE, 'SKU no encontrado'::TEXT;
    RETURN;
  END IF;

  UPDATE inventory
  SET    stock = stock + p_delta
  WHERE  sku = p_sku
  AND    stock + p_delta >= 0
  RETURNING stock INTO v_new_stock;

  IF v_new_stock IS NOT NULL THEN
    RETURN QUERY SELECT p_sku, v_new_stock, p_delta, TRUE, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT p_sku, NULL::INT, p_delta, FALSE, 'Stock insuficiente'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- SP 4: Reporte de inventario con clasificación de nivel de stock
-- Uso: SELECT * FROM fn_get_inventory_report();
CREATE OR REPLACE FUNCTION fn_get_inventory_report()
RETURNS TABLE(
  sku         VARCHAR,
  stock       INT,
  stock_level TEXT
) AS $$
BEGIN
  RETURN QUERY
    SELECT i.sku,
           i.stock,
           CASE
             WHEN i.stock = 0     THEN 'SIN_STOCK'
             WHEN i.stock < 10    THEN 'CRITICO'
             WHEN i.stock < 30    THEN 'BAJO'
             ELSE                      'NORMAL'
           END::TEXT
    FROM   inventory i
    ORDER  BY i.stock ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Fin de stored-procedures.sql
-- ============================================================
