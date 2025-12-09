import React, { useState } from "react";
import client from "@/api/client";

export default function VirtualFitting() {
    const [humanFile, setHumanFile] = useState<File | null>(null);
    const [garmentFile, setGarmentFile] = useState<File | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [category, setCategory] = useState<string>("upper_body");

    // 공통 붙여넣기 핸들러
    // setFile 함수를 인자로 받아서, 어느 칸에 붙여넣을지 결정
    const handlePaste = (
        e: React.ClipboardEvent, 
        setFile: React.Dispatch<React.SetStateAction<File | null>>
    ) => {
        const items = e.clipboardData.items;
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                if (blob) {
                    setFile(blob);
                    e.preventDefault(); // 기본 붙여넣기 동작 방지
                    console.log("이미지 붙여넣기 성공!");
                }
                break;
            }
        }
    };

    const handleFitting = async () => {
        if (!humanFile || !garmentFile) return alert("이미지를 모두 올려주세요.");

        setIsLoading(true);
        const formData = new FormData();
        formData.append("human_img", humanFile);
        formData.append("garm_img", garmentFile);
        formData.append("category", category); 

        try {
            // API 호출
            const response = await client.post("fitting/generate", formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            setResultImage(response.data.image_url);
        } catch (error) {
            console.error(error);
            alert("가상 피팅에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-8 text-center">AI 가상 피팅 👕</h1>
            
            {/* 카테고리 선택 버튼 */}
            <div className="flex justify-center gap-4 mb-8">
                {[
                { label: '상의 (Top)', value: 'upper_body' },
                { label: '하의 (Bottom)', value: 'lower_body' },
                { label: '드레스 (Dress)', value: 'dresses' },
                ].map((item) => (
                <button
                    key={item.value}
                    onClick={() => setCategory(item.value)}
                    className={`px-6 py-3 rounded-full font-bold transition-all ${
                    category === item.value
                        ? 'bg-purple-600 text-white shadow-lg scale-105'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                >
                    {item.label}
                </button>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* 1. 내 사진 업로드 */}
                {/* div에 tabIndex, onPaste, focus 스타일 추가 */}
                <div 
                    tabIndex={0}
                    onPaste={(e) => handlePaste(e, setHumanFile)}
                    className="border-2 border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center min-h-[300px] 
                                cursor-pointer hover:border-purple-400 hover:bg-purple-50/30 transition-all 
                                focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100"
                >
                    <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => setHumanFile(e.target.files?.[0] || null)}
                        className="mb-4 w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                    />
                    
                    {humanFile ? (
                        <img src={URL.createObjectURL(humanFile)} className="h-48 object-contain rounded-md shadow-sm" />
                    ) : (
                        <div className="text-center text-gray-400">
                            <p className="text-4xl mb-2">👤</p>
                            <p className="font-medium">내 전신 사진</p>
                            <p className="text-xs mt-2 text-purple-500 font-bold bg-purple-100 px-2 py-1 rounded-full inline-block">
                                클릭 후 Ctrl+V 가능
                            </p>
                        </div>
                    )}
                </div>

                {/* 2. 옷 사진 업로드 */}
                {/* div에 tabIndex, onPaste, focus 스타일 추가 */}
                <div 
                    tabIndex={0}
                    onPaste={(e) => handlePaste(e, setGarmentFile)}
                    className="border-2 border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center min-h-[300px] 
                                cursor-pointer hover:border-purple-400 hover:bg-purple-50/30 transition-all 
                                focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100"
                >
                    <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => setGarmentFile(e.target.files?.[0] || null)}
                        className="mb-4 w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                    />
                    
                    {garmentFile ? (
                        <img src={URL.createObjectURL(garmentFile)} className="h-48 object-contain rounded-md shadow-sm" />
                    ) : (
                        <div className="text-center text-gray-400">
                            <p className="text-4xl mb-2">👕</p>
                            <p className="font-medium">
                                입어볼 옷 ({category === 'upper_body' ? '상의' : category === 'lower_body' ? '하의' : '드레스'})
                            </p>
                            <p className="text-xs mt-2 text-purple-500 font-bold bg-purple-100 px-2 py-1 rounded-full inline-block">
                                클릭 후 Ctrl+V 가능
                            </p>
                        </div>
                    )}
                </div>

                {/* 3. 결과 화면 */}
                <div className="border-2 border-purple-200 bg-purple-50 rounded-xl p-4 flex flex-col items-center justify-center min-h-[300px]">
                {isLoading ? (
                    <div className="animate-pulse text-purple-600 font-bold">AI가 옷을 입혀보는 중...</div>
                ) : resultImage ? (
                    <div className="relative group">
                        <img src={resultImage} className="h-64 object-contain rounded-lg shadow-lg" />
                        <a 
                            href={resultImage} 
                            target="_blank" 
                            rel="noreferrer"
                            className="absolute bottom-2 right-2 bg-white/80 p-2 rounded-full shadow-sm hover:bg-white text-xs font-bold text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            확대보기 🔍
                        </a>
                    </div>
                ) : (
                    <div className="text-gray-400">결과가 여기에 표시됩니다</div>
                )}
                </div>
            </div>

            <button 
                onClick={handleFitting}
                disabled={isLoading}
                className="w-full mt-8 py-4 bg-black text-white text-xl font-bold rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50"
            >
                {isLoading ? '생성 중...' : '가상 피팅 시작하기 ✨'}
            </button>
        </div>
    )
}