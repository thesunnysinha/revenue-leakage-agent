"use client";

import { useEffect, useMemo, useState } from "react";
import type { BillingData, InvoiceRecord } from "@/lib/api";
import styles from "./WorkspaceViews.module.css";

function money(amount: string, currency: string): string {
  try {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount);
    if (!match) return `${amount} ${currency}`;
    const symbol = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 })
      .formatToParts(0).find((part) => part.type === "currency")?.value ?? `${currency} `;
    const groupedInteger = BigInt(match[2]).toLocaleString("en-US");
    return `${symbol}${match[1]}${groupedInteger}${match[3] ? `.${match[3]}` : ""}`;
  } catch {
    return `${amount} ${currency}`;
  }
}

export default function BillingDataView() {
  const [data, setData] = useState<BillingData | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const response = await fetch("/api/billing-data", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load billing records.");
      setData(await response.json() as BillingData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load billing records.");
    }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/billing-data", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load billing records.");
        return await response.json() as BillingData;
      })
      .then((result) => { if (active) setData(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load billing records."); });
    return () => { active = false; };
  }, []);

  const invoices = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.invoices.filter((invoice) => {
      const matchesText = !term || [invoice.invoice_id, invoice.plan_id, invoice.customer_name, invoice.description].some((value) => value.toLowerCase().includes(term));
      return matchesText && (status === "all" || invoice.status === status);
    });
  }, [data, search, status]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeading}>
        <div><span className={styles.eyebrow}>DEMO WORKSPACE / LEDGERS</span><h1>Billing data</h1><p>Read-only sample contracts, invoices, credits, and exchange rates.</p></div>
        <span className={styles.readOnly}>◉&nbsp; READ ONLY</span>
      </div>
      {error && <div className={styles.error} role="alert"><span>{error}</span><button onClick={() => void load()}>Retry</button></div>}
      {!data && !error && <div className={styles.loading}>Loading sample billing records…</div>}
      {data && <>
        <div className={styles.statGrid}>
          <div className={styles.statCard}><span>Billing plans</span><strong>{data.plans.length}</strong></div>
          <div className={styles.statCard}><span>Invoices</span><strong>{data.invoices.length}</strong></div>
          <div className={styles.statCard}><span>Credit memos</span><strong>{data.credit_memos.length}</strong></div>
          <div className={styles.statCard}><span>FX rates</span><strong>{data.exchange_rates.length}</strong></div>
        </div>

        <section className={styles.dataSection}>
          <div className={styles.sectionHeading}><div><h2>Billing plans</h2><p>Contract value and billing cadence</p></div><span>{data.plans.length} records</span></div>
          <div className={styles.planGrid}>
            {data.plans.map((plan) => <article className={styles.planCard} key={plan.plan_id}>
              <div className={styles.planTop}><strong>{plan.plan_id}</strong><span>{plan.cadence}</span></div>
              <p>{plan.customer_name}</p>
              <div className={styles.planAmount}>{money(plan.total_value, plan.currency)}<small> contract total</small></div>
              <div className={styles.planMeta}>Starts {plan.start_date}{plan.amends ? ` · Amends ${plan.amends}` : ""}</div>
              <div className={styles.chips}>{plan.entitlements.map((entitlement) => <span key={entitlement}>{entitlement}</span>)}</div>
            </article>)}
          </div>
        </section>

        <section className={styles.dataSection}>
          <div className={styles.sectionHeading}><div><h2>Invoices</h2><p>Search by customer, plan, invoice ID, or description</p></div><span>{invoices.length} shown</span></div>
          <div className={styles.filters}><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search invoices" placeholder="Search invoices…" /><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter invoices by status"><option value="all">All statuses</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="void">Void</option></select></div>
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th>Invoice</th><th>Customer / plan</th><th>Issue date</th><th>Amount</th><th>Status</th><th>Description</th></tr></thead>
            <tbody>{invoices.map((invoice: InvoiceRecord) => <tr key={invoice.invoice_id}>
              <td className={styles.mono}>{invoice.invoice_id}</td><td><strong>{invoice.customer_name}</strong><small>{invoice.plan_id || "Unlinked plan"}</small></td><td>{invoice.issue_date}</td><td className={styles.amount}>{money(invoice.amount_invoiced, invoice.currency)}</td><td><span className={`${styles.status} ${styles[`status_${invoice.status}`]}`}>{invoice.status}</span></td><td>{invoice.description}</td>
            </tr>)}</tbody>
          </table>{invoices.length === 0 && <div className={styles.empty}>No invoices match those filters.</div>}</div>
        </section>

        <div className={styles.lowerGrid}>
          <section className={styles.dataSection}><div className={styles.sectionHeading}><div><h2>Credit memos</h2><p>Existing adjustments</p></div><span>{data.credit_memos.length}</span></div>
            {data.credit_memos.map((memo) => <article className={styles.recordRow} key={memo.memo_id}><div><strong>{memo.memo_id}</strong><small>{memo.customer_name || memo.plan_id} · {memo.invoice_id}</small><small>{memo.reason}</small></div><strong>{money(memo.amount, memo.currency)}</strong></article>)}
          </section>
          <section className={styles.dataSection}><div className={styles.sectionHeading}><div><h2>Exchange rates</h2><p>Fixture conversion rates</p></div><span>{data.exchange_rates.length}</span></div>
            {data.exchange_rates.map((rate, index) => <article className={styles.recordRow} key={`${rate.date}-${index}`}><div><strong>{rate.from_currency} → {rate.to_currency}</strong><small>{rate.date}</small></div><strong>{rate.rate}</strong></article>)}
          </section>
        </div>
      </>}
    </div>
  );
}
