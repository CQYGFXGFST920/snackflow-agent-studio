import products from "@/app/data/products.json";
import activities from "@/app/data/activities.json";
import coupons from "@/app/data/coupons.json";
import { AdminHeader } from "@/components/ToolManager";

export default function CatalogPage() {
  return <main><AdminHeader active="catalog" /><div className="workspace catalog-page">
    <section className="page-heading"><div><p className="eyebrow">LOCAL BUSINESS DATA</p><h1>商品与优惠目录</h1><p>只读展示 Agent Tool 实际使用的本地业务基础数据。重置不会修改这些文件。</p></div><div className="stats-card"><b>{products.length}</b><small>商品</small></div></section>
    <div className="catalog-grid">
      <section className="card catalog-products"><div className="section-head"><div><span className="step-num">PRODUCTS</span><h2>商品目录</h2></div><small>products.json</small></div>
        <div className="catalog-list">{products.map((product) => <article key={product.id}><div><b>{product.name}</b><small>{product.id}</small></div><strong>¥{product.price.toFixed(2)}</strong><p>{product.description}</p><span>{product.tags.join(" · ")}</span></article>)}</div>
      </section>
      <aside className="catalog-side">
        <section className="card catalog-mini"><div className="section-head"><h2>优惠活动</h2><small>activities.json</small></div>{activities.map((item) => <div key={item.id}><b>{item.name}</b><span>满 ¥{item.threshold} 减 ¥{item.discount}</span></div>)}</section>
        <section className="card catalog-mini"><div className="section-head"><h2>优惠券</h2><small>coupons.json</small></div>{coupons.map((item) => <div key={item.id}><b>{item.name}</b><span>满 ¥{item.threshold} 减 ¥{item.discount} · {item.enabled ? "可用" : "停用"}</span></div>)}</section>
      </aside>
    </div>
  </div></main>;
}
