import type { InventoryItem } from '../types';

interface CategoryChartProps {
    items: InventoryItem[];
}

export function CategoryChart({ items }: CategoryChartProps) {
    // Group items by main category
    const categoryData: Record<string, number> = {};
    items.forEach(item => {
        const mainCat = item.category.split('-')[0] || '未分类';
        categoryData[mainCat] = (categoryData[mainCat] || 0) + 1;
    });

    const total = items.length;
    if (total === 0) return null;

    const data = Object.entries(categoryData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6); // Show top 6

    // Colors for the chart
    const colors = [
        '#e76f51', // 砖红 (Burnt Sienna)
        '#f4a261', // 复古橙 (Sandy Brown)
        '#e9c46a', // 复古黄 (Saffron)
        '#8ab17d', // 绿灰 (Olive Green)
        '#2a9d8f', // 深青 (Persian Green)
        '#264653'  // 藏青 (Charcoal/Teal)
    ];

    // Simple donut chart using SVG
    let cumulativePercent = 0;

    const getCoordinatesForPercent = (percent: number) => {
        const x = Math.cos(2 * Math.PI * percent);
        const y = Math.sin(2 * Math.PI * percent);
        return [x, y];
    };

    return (
        <div className="category-chart-container">
            <div className="chart-wrapper">
                <svg viewBox="-1.1 -1.1 2.2 2.2" style={{ transform: 'rotate(-90deg)' }}>
                    {data.map(([category, count], i) => {
                        const percent = count / total;
                        const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
                        cumulativePercent += percent;
                        const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
                        const largeArcFlag = percent > 0.5 ? 1 : 0;
                        const pathData = [
                            `M ${startX} ${startY}`,
                            `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`,
                            `L 0 0`,
                        ].join(' ');

                        return <path key={category} d={pathData} fill={colors[i % colors.length]} />;
                    })}
                    <circle cx="0" cy="0" r="0.7" fill="var(--glass-bg)" style={{ backdropFilter: 'blur(10px)' }} />
                </svg>
                <div className="chart-center-text">
                    <span className="total-label">总计</span>
                    <span className="total-value">{total}</span>
                </div>
            </div>
            <div className="chart-legend">
                {data.map(([category, count], i) => (
                    <div key={category} className="legend-item">
                        <span className="legend-color" style={{ backgroundColor: colors[i % colors.length] }}></span>
                        <span className="legend-name">{category}</span>
                        <span className="legend-count">{count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
