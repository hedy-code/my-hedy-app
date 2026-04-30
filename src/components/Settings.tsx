import React, { useState, useRef } from 'react';
import { db } from '../firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Download, Upload, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';
import './Settings.css';

export function Settings() {
    const { user } = useAuth();
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const exportData = async () => {
        if (!user) return;
        setIsExporting(true);
        setMessage(null);

        try {
            const itemsSnap = await getDocs(collection(db, 'users', user.uid, 'items'));
            const shoppingSnap = await getDocs(collection(db, 'users', user.uid, 'shopping'));
            const activitiesSnap = await getDocs(collection(db, 'users', user.uid, 'activities'));
            const historicalSnap = await getDocs(collection(db, 'users', user.uid, 'historical'));

            const data = {
                items: itemsSnap.docs.map(d => d.data()),
                shopping: shoppingSnap.docs.map(d => d.data()),
                activities: activitiesSnap.docs.map(d => d.data()),
                historical: historicalSnap.docs.map(d => d.data()),
                timestamp: new Date().toISOString()
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `household_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            setMessage({ type: 'success', text: '数据导出成功！请妥善保管你的备份文件。' });
        } catch (err: any) {
            console.error('Export Error:', err);
            setMessage({ type: 'error', text: '导出失败：' + err.message });
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!user) return;
        const file = e.target.files?.[0];
        if (!file) return;

        setMessage(null);
        setIsImporting(true);

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);

                if (!data.items || !data.shopping || !data.activities || !data.historical) {
                    throw new Error('无效的备份文件格式！文件必须包含应用运行所需的所有数据结构。');
                }

                const collections = [
                    { name: 'items', docs: data.items },
                    { name: 'shopping', docs: data.shopping },
                    { name: 'activities', docs: data.activities },
                    { name: 'historical', docs: data.historical }
                ];

                const allOps: { col: string, docData: any }[] = [];
                collections.forEach(col => {
                    col.docs.forEach((docData: any) => {
                        allOps.push({ col: col.name, docData });
                    });
                });

                let currentBatch = writeBatch(db);
                let opCount = 0;

                for (const op of allOps) {
                    if (!op.docData.id) continue;
                    const docRef = doc(db, 'users', user.uid, op.col, op.docData.id);
                    currentBatch.set(docRef, op.docData); // Overwrite or merge
                    opCount++;

                    if (opCount === 450) {
                        await currentBatch.commit();
                        currentBatch = writeBatch(db);
                        opCount = 0;
                    }
                }

                if (opCount > 0) {
                    await currentBatch.commit();
                }

                setMessage({ type: 'success', text: '数据恢复成功！建议刷新页面以确保数据完全同步。' });
            } catch (err: any) {
                console.error('Import Error:', err);
                setMessage({ type: 'error', text: '恢复失败：' + err.message });
            } finally {
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        
        reader.onerror = () => {
            setMessage({ type: 'error', text: '读取文件失败！' });
            setIsImporting(false);
        };

        reader.readAsText(file);
    };

    return (
        <div className="settings-container">
            <h1 className="page-title">设置与数据管理</h1>
            
            <div className="settings-section glass">
                <div className="section-header">
                    <h2><ShieldAlert size={24} /> 数据安全</h2>
                    <p className="section-desc">保护你的数据资产。你可以随时将云端数据下载到本地保存，也可以在需要时恢复它们。</p>
                </div>

                {message && (
                    <div className={`message-banner ${message.type}`}>
                        {message.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                        <span>{message.text}</span>
                    </div>
                )}

                <div className="data-actions">
                    <div className="action-card">
                        <div className="action-icon export">
                            <Download size={32} />
                        </div>
                        <h3>导出数据备份</h3>
                        <p>将当前所有的库存物品、购物清单和历史记录打包下载为一个 JSON 文件。</p>
                        <button 
                            className="btn btn-primary btn-block" 
                            onClick={exportData}
                            disabled={isExporting || isImporting}
                        >
                            {isExporting ? '生成文件中...' : '立即备份'}
                        </button>
                    </div>

                    <div className="action-card">
                        <div className="action-icon import">
                            <Upload size={32} />
                        </div>
                        <h3>导入数据恢复</h3>
                        <p>从之前下载的 JSON 备份文件中恢复数据。导入的数据将会同名覆盖云端的现有数据。</p>
                        <input 
                            type="file" 
                            accept=".json" 
                            style={{ display: 'none' }} 
                            ref={fileInputRef}
                            onChange={importData}
                        />
                        <button 
                            className="btn btn-secondary btn-block" 
                            onClick={handleImportClick}
                            disabled={isExporting || isImporting}
                        >
                            {isImporting ? '恢复数据中...' : '选择备份文件上传'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
