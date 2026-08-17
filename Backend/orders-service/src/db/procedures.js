// Stored procedures de orders-service.
// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de SQL).
module.exports = function createProcedureManager(pool) {
  async function ensureProcedures() {
    // Fase 4C del roadmap multi-tenant: ambos SP ahora reciben p_tenant_id y
    // filtran por el, ademas del status/id. drop previo porque cambia la firma
    // (numero/orden de parametros), CREATE OR REPLACE no permite eso.
    await pool.query(`DROP FUNCTION IF EXISTS fn_get_orders_with_customer(TEXT)`).catch(() => {});
    await pool.query(`
      CREATE OR REPLACE FUNCTION fn_get_orders_with_customer(p_status TEXT, p_tenant_id INT)
      RETURNS TABLE(order_id INT, customer_name VARCHAR, customer_email VARCHAR,
                    sku VARCHAR, quantity INT, status VARCHAR, created_at TIMESTAMP, assigned_to VARCHAR)
      AS $fn$
      BEGIN
        RETURN QUERY
          SELECT o.id, COALESCE(c.name,'Sin cliente'), COALESCE(c.email,''),
                 o.sku, o.quantity, o.status, o.created_at, o.assigned_to
          FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
          WHERE o.tenant_id = p_tenant_id AND (p_status IS NULL OR o.status = p_status)
          ORDER BY o.created_at DESC;
      END;
      $fn$ LANGUAGE plpgsql;
    `);
    await pool.query(`DROP FUNCTION IF EXISTS fn_cancel_order(INT, TEXT)`).catch(() => {});
    await pool.query(`
      CREATE OR REPLACE FUNCTION fn_cancel_order(p_order_id INT, p_reason TEXT, p_tenant_id INT)
      RETURNS SETOF orders AS $fn$
      BEGIN
        UPDATE orders SET status = 'CANCELADO', cancel_reason = p_reason
        WHERE id = p_order_id AND tenant_id = p_tenant_id AND status <> 'CANCELADO';
        RETURN QUERY SELECT * FROM orders WHERE id = p_order_id AND tenant_id = p_tenant_id;
      END;
      $fn$ LANGUAGE plpgsql;
    `);

    // Fase 2 del roadmap de expansión comercial: ajuste atómico del saldo de
    // cuenta corriente, mismo patrón de locking que fn_adjust_stock en
    // inventory-service (SELECT ... FOR UPDATE, rechaza si viola el invariante
    // — aquí, superar el límite de crédito del cliente).
    await pool.query(`DROP FUNCTION IF EXISTS fn_adjust_customer_credit(INT, NUMERIC, INT)`).catch(() => {});
    await pool.query(`
      CREATE OR REPLACE FUNCTION fn_adjust_customer_credit(p_customer_id INT, p_delta NUMERIC, p_tenant_id INT)
      RETURNS TABLE(new_balance NUMERIC, success BOOLEAN, error_msg TEXT)
      AS $fn$
      DECLARE v_new_balance NUMERIC; v_limit NUMERIC;
      BEGIN
        SELECT credit_limit INTO v_limit FROM customers WHERE id = p_customer_id AND tenant_id = p_tenant_id FOR UPDATE;
        IF NOT FOUND THEN
          RETURN QUERY SELECT NULL::NUMERIC, FALSE, 'Cliente no encontrado'::TEXT; RETURN;
        END IF;
        UPDATE customers SET credit_balance = credit_balance + p_delta
          WHERE id = p_customer_id AND tenant_id = p_tenant_id
            AND (v_limit IS NULL OR credit_balance + p_delta <= v_limit)
          RETURNING credit_balance INTO v_new_balance;
        IF v_new_balance IS NOT NULL THEN
          RETURN QUERY SELECT v_new_balance, TRUE, NULL::TEXT;
        ELSE
          RETURN QUERY SELECT NULL::NUMERIC, FALSE, 'El cargo supera el límite de crédito del cliente'::TEXT;
        END IF;
      END;
      $fn$ LANGUAGE plpgsql;
    `);
  }

  return { ensureProcedures };
};
