// Stored procedures de inventory-service.
// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de SQL).
module.exports = function createProcedureManager(pool) {
  async function ensureProcedures() {
    // Fase 4C: ambos SP reciben p_tenant_id y filtran por el. drop previo
    // porque cambia la firma, CREATE OR REPLACE no permite eso.
    await pool.query(`DROP FUNCTION IF EXISTS fn_adjust_stock(TEXT, INT)`).catch(() => {});
    await pool.query(`
      CREATE OR REPLACE FUNCTION fn_adjust_stock(p_sku TEXT, p_delta INT, p_tenant_id INT)
      RETURNS TABLE(sku_out TEXT, new_stock INT, delta INT, success BOOLEAN, error_msg TEXT)
      AS $fn$
      DECLARE v_new_stock INT; v_exists BOOLEAN;
      BEGIN
        SELECT EXISTS(SELECT 1 FROM inventory WHERE sku = p_sku AND tenant_id = p_tenant_id) INTO v_exists;
        IF NOT v_exists THEN
          RETURN QUERY SELECT p_sku, NULL::INT, p_delta, FALSE, 'SKU no encontrado'::TEXT; RETURN;
        END IF;
        UPDATE inventory SET stock = stock + p_delta WHERE sku = p_sku AND tenant_id = p_tenant_id AND stock + p_delta >= 0 RETURNING stock INTO v_new_stock;
        IF v_new_stock IS NOT NULL THEN
          RETURN QUERY SELECT p_sku, v_new_stock, p_delta, TRUE, NULL::TEXT;
        ELSE
          RETURN QUERY SELECT p_sku, NULL::INT, p_delta, FALSE, 'Stock insuficiente'::TEXT;
        END IF;
      END;
      $fn$ LANGUAGE plpgsql;
    `);
    await pool.query(`DROP FUNCTION IF EXISTS fn_upsert_product(TEXT, TEXT, INT, INT, INT, TEXT, INT)`).catch(() => {});
    await pool.query(`DROP FUNCTION IF EXISTS fn_upsert_product(TEXT, TEXT, INT, INT, INT, TEXT, TEXT, NUMERIC, BOOLEAN, INT)`).catch(() => {});
    await pool.query(`
      CREATE OR REPLACE FUNCTION fn_upsert_product(
        p_sku TEXT, p_name TEXT, p_stock INT, p_price INT, p_cost INT, p_category TEXT,
        p_unit_of_measure TEXT, p_tax_rate NUMERIC, p_active BOOLEAN, p_tenant_id INT
      )
      RETURNS TABLE(sku_out TEXT, created BOOLEAN) AS $fn$
      BEGIN
        RETURN QUERY
          INSERT INTO inventory (sku, name, stock, price, cost, category, unit_of_measure, tax_rate, active, tenant_id)
          VALUES (p_sku, p_name, p_stock, p_price, p_cost, p_category, p_unit_of_measure, p_tax_rate, p_active, p_tenant_id)
          ON CONFLICT (tenant_id, sku) DO UPDATE SET
            name = EXCLUDED.name, stock = EXCLUDED.stock, price = EXCLUDED.price,
            cost = EXCLUDED.cost, category = EXCLUDED.category, unit_of_measure = EXCLUDED.unit_of_measure,
            tax_rate = EXCLUDED.tax_rate, active = EXCLUDED.active
          RETURNING sku::TEXT, (xmax = 0);
      END;
      $fn$ LANGUAGE plpgsql;
    `);
    await pool.query(`DROP FUNCTION IF EXISTS fn_get_inventory_report()`).catch(() => {});
    await pool.query(`
      CREATE OR REPLACE FUNCTION fn_get_inventory_report(p_tenant_id INT)
      RETURNS TABLE(sku VARCHAR, stock INT, stock_level TEXT)
      AS $fn$
      BEGIN
        RETURN QUERY
          SELECT i.sku, i.stock,
            CASE WHEN i.stock = 0 THEN 'SIN_STOCK' WHEN i.stock < 10 THEN 'CRITICO'
                 WHEN i.stock < 30 THEN 'BAJO' ELSE 'NORMAL' END::TEXT
          FROM inventory i WHERE i.tenant_id = p_tenant_id ORDER BY i.stock ASC;
      END;
      $fn$ LANGUAGE plpgsql;
    `);
  }

  return { ensureProcedures };
};
