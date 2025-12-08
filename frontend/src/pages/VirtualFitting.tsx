import React, { useState } from "react";
import client from "../api/client";

export default function VirtualFitting() {
    const [humanFile, setHumanFile] = useState<File | null>(null);
    const [garmentFile, setGarmentFile] = useState<File | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleFitting = async () => {
        if (!humanFile || !garmentFile) return alert("이미지를 모두 올려주세요.");

        setIsLoading(true);
        const formData = new FormData();
        formData.append("human_img", humanFile);
        formData.append("garm_img", garmentFile);
        formData.append("category", "upper_body"); // 일단 상의로 고정

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
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* 1. 내 사진 업로드 */}
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center min-h-[300px]">
            <input 
                type="file" 
                accept="image/*"
                onChange={(e) => setHumanFile(e.target.files?.[0] || null)}
                className="mb-4"
            />
            {humanFile && <img src={URL.createObjectURL(humanFile)} className="h-48 object-contain" />}
            <p className="mt-2 font-bold text-gray-500">내 전신 사진</p>
            </div>

            {/* 2. 옷 사진 업로드 */}
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center min-h-[300px]">
            <input 
                type="file" 
                accept="image/*"
                onChange={(e) => setGarmentFile(e.target.files?.[0] || null)}
                className="mb-4"
            />
            {garmentFile && <img src={URL.createObjectURL(garmentFile)} className="h-48 object-contain" />}
            <p className="mt-2 font-bold text-gray-500">입어볼 옷 사진</p>
            </div>

            {/* 3. 결과 화면 */}
            <div className="border-2 border-purple-200 bg-purple-50 rounded-xl p-4 flex flex-col items-center justify-center min-h-[300px]">
            {isLoading ? (
                <div className="animate-pulse text-purple-600 font-bold">AI가 옷을 입혀보는 중...</div>
            ) : resultImage ? (
                <img src={resultImage} className="h-64 object-contain rounded-lg shadow-lg" />
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