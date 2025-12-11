import React, { useState, useEffect } from "react";
import client from "@/api/client";
import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";

// 히스토리 타입 정의
interface HistoryItem {
  id: number;
  result_image_url: string;
  category: string;
  created_at: string;
}

// 로딩 문구 리스트
const LOADING_MESSAGES = [
  "AI가 고객님의 체형을 분석하고 있어요 🧐",
  "옷의 주름을 다림질하는 중... 👔",
  "어떤 핏이 나올지 계산하고 있어요 📐",
  "조명을 자연스럽게 맞추는 중이에요 ✨",
  "옷감을 부드럽게 만들고 있어요 🧶",
  "거의 다 됐어요! 핏을 확인해보세요 📸",
  "마무리 픽셀을 다듬는 중... 🎨"
];

export default function VirtualFitting() {
    const [humanFile, setHumanFile] = useState<File | null>(null);
    const [garmentFile, setGarmentFile] = useState<File | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);
    
    const [category, setCategory] = useState<string>("upper_body");
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    

    // 히스토리 불러오기
    const fetchHistory = async () => {
        try {
            const res = await client.get("/fitting/history");
            setHistory(res.data);
        } catch (err) {
            console.error("히스토리 불러오기 실패:", err);
        }
    };

    // 페이지 접속 시 히스토리 로딩
    useEffect(() => {
        fetchHistory();
    }, []);

    // 로딩 애니메이션 타이머 (useEffect)
    useEffect(() => {
        let msgInterval: NodeJS.Timeout;
        let progressInterval: NodeJS.Timeout;

        if (isLoading) {
            setLoadingMsgIndex(0);
            setProgress(0);

            // 1. 문구 변경 (3초마다)
            msgInterval = setInterval(() => {
                setLoadingMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
            }, 3000);

            // 2. 가짜 진행률 바 (0% -> 98%까지 천천히 증가)
            progressInterval = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 98) return 98; // 98%에서 멈춤 (완료되면 100% 없이 바로 결과로 넘어감)
                    // 초반엔 빠르고 후반엔 느리게 (랜덤성 추가)
                    const increment = prev < 60 ? Math.random() * 6 : Math.random() * 3;
                    return Math.min(prev + increment, 98);
                });
            }, 500);
        }

    return () => {
      clearInterval(msgInterval);
      clearInterval(progressInterval);
    };
  }, [isLoading]);

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
        setResultImage(null);
        const formData = new FormData();
        formData.append("human_img", humanFile);
        formData.append("garm_img", garmentFile);
        formData.append("category", category); 

        try {
            // API 호출
            const response = await client.post("fitting/generate", formData, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 300000,    // 5분 타임아웃 설정 (Replicate의 Cold Start 대응)
            });
            setResultImage(response.data.image_url);
            fetchHistory(); // 히스토리 갱신
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
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-white/50 backdrop-blur-sm absolute inset-0 z-10">
              
                        {/* 1. 귀여운 아이콘 애니메이션 */}
                        <div className="mb-6 relative">
                            <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center text-xl animate-pulse">
                            👕
                            </div>
                        </div>

                        {/* 2. 롤링 텍스트 (Fade 효과 느낌) */}
                        <p className="text-lg font-bold text-gray-700 mb-2 min-h-[1.75rem] transition-all duration-500 text-center">
                            {LOADING_MESSAGES[loadingMsgIndex]}
                        </p>
                        
                        <p className="text-xs text-gray-400 mb-6">
                            최대 1분 정도 소요될 수 있습니다. 잠시만 기다려주세요.
                        </p>

                        {/* 3. 프로그레스 바 */}
                        <div className="w-full max-w-[200px] h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300 ease-out"
                            style={{ width: `${progress}%` }}
                            />
                        </div>
                        <p className="text-xs text-purple-600 font-bold mt-2">
                            {Math.round(progress)}%
                        </p>

                    </div>
                ) : resultImage && humanFile ? (
                    <div className="w-full h-full flex flex-col items-center relative group">
                        <ReactCompareSlider
                            itemOne={
                            <ReactCompareSliderImage 
                                src={URL.createObjectURL(humanFile)} 
                                srcSet={URL.createObjectURL(humanFile)} 
                                alt="Original" 
                            />
                            }
                            itemTwo={
                            <ReactCompareSliderImage 
                                src={resultImage} 
                                srcSet={resultImage} 
                                alt="Result" 
                            />
                            }
                            style={{ width: '100%', height: '100%', borderRadius: '0.5rem' }}
                            // 슬라이더 바 색상 커스텀 (보라색)
                            handle={
                            <div className="w-1 h-full bg-purple-500 shadow-[0_0_10px_rgba(0,0,0,0.3)] relative">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md border-2 border-purple-500">
                                <span className="text-purple-600 text-xs">↔</span>
                                </div>
                            </div>
                            }
                        />
                        <p className="mt-2 text-xs text-gray-500 font-medium">
                            👈 왼쪽: 원본 / 👉 오른쪽: 피팅 결과
                        </p>
                        
                        {/* 확대보기 링크는 하단에 작게 유지 */}
                        <button 
                            onClick={() => resultImage && setSelectedImage(resultImage)}
                            className="absolute bottom-8 right-4 bg-white/90 p-2 rounded-full shadow-sm hover:bg-white text-xs font-bold text-gray-700 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10"
                        >
                            확대보기 🔍
                        </button>
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

            {/* 구분선 */}
            <hr className="my-12 border-gray-200" />

            {/* ✨ [추가] 피팅 히스토리 갤러리 */}
            <div className="mb-20">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                📜 내가 입어본 옷 리스트
                <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                    {history.length}개
                </span>
                </h2>

                {history.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-xl text-gray-400">
                    아직 피팅 기록이 없습니다. 첫 피팅을 시도해보세요!
                </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {history.map((item) => (
                        <div key={item.id} className="group relative bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                            {/* 이미지 */}
                            <div className="aspect-[3/4] bg-gray-100 overflow-hidden">
                            <img 
                                src={item.result_image_url} 
                                alt="Fitting Result" 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            </div>
                            
                            {/* 오버레이 (마우스 올리면 나옴) */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                            <button 
                                onClick={() => setSelectedImage(item.result_image_url)}
                                className="bg-white text-gray-900 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-gray-100 cursor-pointer"
                            >
                                크게 보기 🔍
                            </button>
                            <button 
                                onClick={() => alert(`상품(ID:${item.id})을 장바구니에 담았습니다! (구현 예정)`)}
                                className="bg-purple-600 text-white px-3 py-1.5 rounded-full text-xs font-bold hover:bg-purple-700"
                            >
                                장바구니 담기 🛒
                            </button>
                            </div>

                            {/* 하단 정보 */}
                            <div className="p-3">
                            <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-md">
                                {item.category === 'upper_body' ? '상의' : item.category === 'lower_body' ? '하의' : '드레스'}
                            </span>
                            <p className="text-[10px] text-gray-400 mt-1">
                                {new Date(item.created_at).toLocaleDateString()}
                            </p>
                            </div>
                        </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 이미지 확대 보기 모달 */}
            {selectedImage && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-pointer"
                    onClick={() => setSelectedImage(null)} // 배경 클릭 시 닫기
                >
                    <div className="relative max-w-4xl max-h-[90vh] w-full flex justify-center">
                        <img 
                            src={selectedImage} 
                            alt="Enlarged Result" 
                            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()} // 이미지 클릭 시 닫기 방지
                        />
                        
                        {/* 닫기 버튼 */}
                        <button 
                            onClick={() => setSelectedImage(null)}
                            className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>
            )}

        </div>
    )
}