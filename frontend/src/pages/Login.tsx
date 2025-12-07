import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { Eye, EyeOff, Check, Search } from 'lucide-react';

// react-daum-postcode : 주소 검색 라이브러리
// Python 라이브러리가 아님. JavaScript/React 전용 라이브러리임. -> requirements.txt에 추가하지 말 것!
// npm install react-daum-postcode -> package.json에 자동 추가
// Docker 빌드하면 자동으로 설치됨. 
import DaumPostcodeEmbed from 'react-daum-postcode';

// 🖼️ 주소 검색 모달 스타일 (간단한 구현)
const modalStyle = {
  position: 'fixed' as 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 1000,
  border: '1px solid #ccc',
  background: '#fff',
  width: '400px',
  height: '500px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
};

const overlayStyle = {
  position: 'fixed' as 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  zIndex: 999
};

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 폼 데이터 확장
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    confirmPassword: '',
    birthDate: '',      // YYYY-MM-DD
    phoneNumber: '',    // 01012345678
    phoneCode: '',      // 인증번호 입력값
    zipCode: '',        // 우편번호
    address: '',        // 기본주소
    detailAddress: ''   // 상세주소
  });

  // 🔐 전화번호 인증 상태
  const [isPhoneSent, setIsPhoneSent] = useState(false);     // 인증번호 발송 여부
  const [isPhoneVerified, setIsPhoneVerified] = useState(false); // 인증 완료 여부

  // 🏠 주소 검색 모달 상태
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 📮 주소 검색 완료 핸들러
  const handleAddressComplete = (data: any) => {
    let fullAddress = data.address;
    let extraAddress = '';

    if (data.addressType === 'R') {
      if (data.bname !== '') extraAddress += data.bname;
      if (data.buildingName !== '') extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName);
      fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '');
    }

    setFormData(prev => ({
      ...prev,
      zipCode: data.zonecode,
      address: fullAddress
    }));
    setIsAddressModalOpen(false);
  };

  // 📱 전화번호 인증 요청 (API 연동)
  const handleSendPhoneAuth = async () => {
    if (!formData.phoneNumber) {
      alert("전화번호를 입력해주세요.");
      return;
    }
    try {
      // POST /auth/send-code 요청
      await client.post('/auth/send-code', { 
        phone_number: formData.phoneNumber 
      });
      
      setIsPhoneSent(true);
      alert("인증번호가 발송되었습니다.\n(서버 콘솔을 확인하세요!)");
      
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail || "발송 실패";
      alert(msg);
    }
  };

  // 📱 전화번호 인증 확인 (API 연동)
  const handleVerifyPhoneCode = async () => {
    if (!formData.phoneCode) {
      alert("인증번호를 입력해주세요.");
      return;
    }

    try {
      // POST /auth/verify-code 요청
      await client.post('/auth/verify-code', { 
        phone_number: formData.phoneNumber,
        code: formData.phoneCode
      });
      
      setIsPhoneVerified(true);
      alert("✅ 인증이 완료되었습니다.");
      
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail || "인증 실패";
      alert(msg);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isLoginMode) {
        // 🔵 로그인 로직
        const formBody = new URLSearchParams();
        formBody.append('username', formData.email);
        formBody.append('password', formData.password);

        // 🚨 FIX: baseURL에 이미 '/api/v1'이 있으므로 여기서는 '/auth/login'만 씁니다.
        const response = await client.post('/auth/login', formBody.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token, refresh_token } = response.data;
        
        // 🚨 FIX: '/auth/me'로 요청
        const userRes = await client.get('/auth/me', {
          headers: { 'Authorization': `Bearer ${access_token}` }
        });

        login(access_token, refresh_token, userRes.data);
        
        if (userRes.data.is_superuser) {
            navigate('/admin', { replace: true });
        } else {
            navigate('/', { replace: true });
        }

      } else {
        // 🟣 회원가입 로직
        if (formData.password !== formData.confirmPassword) {
          setError("비밀번호가 일치하지 않습니다.");
          setIsLoading(false);
          return;
        }

        if (!isPhoneVerified) {
          setError("전화번호 인증을 완료해주세요.");
          setIsLoading(false);
          return;
        }

        // 🚨 FIX: '/auth/signup'으로 요청
        await client.post('/auth/signup', {
          email: formData.email,
          password: formData.password,
          full_name: formData.fullName || undefined,
          phone_number: formData.phoneNumber,
          birth_date: formData.birthDate || null,
          zip_code: formData.zipCode,
          address: formData.address,
          detail_address: formData.detailAddress
        });

        alert("회원가입이 완료되었습니다! 로그인해주세요.");
        setIsLoginMode(true);
        setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
      }

    } catch (err: any) {
      console.error(err);
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail[0].msg);
      } else {
        setError(detail || "요청 처리에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 소셜 로그인 핸들러 (현재는 UI만 작동)
  const handleSocialLogin = (provider: string) => {
    alert(`${provider} 로그인은 준비 중입니다.`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 transition-colors duration-300">
      
      {/* 주소 검색 모달 */}
      {isAddressModalOpen && (
        <>
          <div style={overlayStyle} onClick={() => setIsAddressModalOpen(false)} />
          <div style={modalStyle}>
            <DaumPostcodeEmbed onComplete={handleAddressComplete} style={{ height: '100%' }} />
          </div>
        </>
      )}

      {/* 배경 장식 요소 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[600px] h-[600px] bg-purple-200/30 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[500px] h-[500px] bg-blue-200/30 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-[420px] z-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-500 tracking-tighter">
            MODIFY
          </h1>
        </div>

        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-white/20 rounded-3xl shadow-xl p-8">
          
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* 아이디 */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 ml-1">아이디(이메일)</label>
              <input
                name="email"
                type="email"
                placeholder="example@modify.com"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full h-12 px-4 bg-gray-100 dark:bg-gray-700/50 border-none rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-gray-900 dark:text-white transition-all"
              />
            </div>

            {/* 비밀번호 */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 ml-1">비밀번호</label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="영문, 숫자 조합 6~20자 입력"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="w-full h-12 px-4 bg-gray-100 dark:bg-gray-700/50 border-none rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-gray-900 dark:text-white transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* 회원가입 전용 필드 */}
            {!isLoginMode && (
              <>
                {/* 비밀번호 확인 */}
                <div className="space-y-1 animate-fade-in-down">
                  <label className="text-xs font-semibold text-gray-500 ml-1">비밀번호 확인</label>
                  <input
                    name="confirmPassword"
                    type="password"
                    placeholder="비밀번호를 한번 더 입력해주세요"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    className="w-full h-12 px-4 bg-gray-100 dark:bg-gray-700/50 border-none rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-gray-900 dark:text-white transition-all"
                  />
                </div>

                {/* 이름 */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 ml-1">이름</label>
                  <input
                    name="fullName"
                    type="text"
                    placeholder="홍길동"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                    className="w-full h-12 px-4 bg-gray-100 dark:bg-gray-700/50 border-none rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-gray-900 dark:text-white transition-all"
                  />
                </div>

                {/* 생년월일 */}
                <div className="space-y-1 animate-fade-in-down">
                  <label className="text-xs font-semibold text-gray-500 ml-1">생년월일</label>
                  <input
                    name="birthDate"
                    type="date"
                    value={formData.birthDate}
                    onChange={handleChange}
                    required
                    className="w-full h-12 px-4 bg-gray-100 dark:bg-gray-700/50 border-none rounded-xl focus:ring-2 focus:ring-purple-500 outline-none dark:text-white"
                  />
                </div>

                {/* 전화번호 인증 */}
                <div className="space-y-1 animate-fade-in-down">
                  <label className="text-xs font-semibold text-gray-500 ml-1">전화번호</label>
                  <div className="flex gap-2">
                    <input
                      name="phoneNumber"
                      type="text"
                      placeholder="01012345678"
                      value={formData.phoneNumber}
                      onChange={handleChange}
                      disabled={isPhoneVerified}
                      className="flex-1 h-12 px-4 bg-gray-100 dark:bg-gray-700/50 border-none rounded-xl focus:ring-2 focus:ring-purple-500 outline-none dark:text-white disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={handleSendPhoneAuth}
                      disabled={isPhoneVerified}
                      className="px-4 h-12 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-white rounded-xl text-sm font-bold whitespace-nowrap hover:bg-gray-300 transition-colors disabled:opacity-50"
                    >
                      {isPhoneSent ? '재전송' : '인증요청'}
                    </button>
                  </div>
                </div>

                {isPhoneSent && !isPhoneVerified && (
                  <div className="flex gap-2 animate-fade-in-down">
                    <input
                      name="phoneCode"
                      type="text"
                      placeholder="인증번호 6자리"
                      value={formData.phoneCode}
                      onChange={handleChange}
                      className="flex-1 h-12 px-4 bg-gray-100 dark:bg-gray-700/50 border-none rounded-xl focus:ring-2 focus:ring-purple-500 outline-none dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyPhoneCode}
                      className="px-4 h-12 bg-purple-100 text-purple-700 rounded-xl text-sm font-bold whitespace-nowrap hover:bg-purple-200 transition-colors"
                    >
                      확인
                    </button>
                  </div>
                )}

                {isPhoneVerified && (
                  <p className="text-xs text-green-500 font-bold ml-1">✅ 인증이 완료되었습니다.</p>
                )}

                {/* 주소 입력 */}
                <div className="space-y-1 animate-fade-in-down pt-2">
                  <label className="text-xs font-semibold text-gray-500 ml-1">주소</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      name="zipCode"
                      type="text"
                      placeholder="우편번호"
                      value={formData.zipCode}
                      readOnly
                      className="w-24 h-12 px-4 bg-gray-100 dark:bg-gray-700/50 border-none rounded-xl text-gray-500 outline-none cursor-default"
                    />
                    <button
                      type="button"
                      onClick={() => setIsAddressModalOpen(true)}
                      className="flex-1 h-12 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-gray-300 transition-colors"
                    >
                      <Search size={16} /> 주소 검색
                    </button>
                  </div>
                  <input
                    name="address"
                    type="text"
                    placeholder="기본 주소"
                    value={formData.address}
                    readOnly
                    className="w-full h-12 px-4 bg-gray-100 dark:bg-gray-700/50 border-none rounded-xl mb-2 text-gray-500 outline-none"
                  />
                  <input
                    name="detailAddress"
                    type="text"
                    placeholder="상세 주소 입력 (예: 101동 101호)"
                    value={formData.detailAddress}
                    onChange={handleChange}
                    className="w-full h-12 px-4 bg-gray-100 dark:bg-gray-700/50 border-none rounded-xl focus:ring-2 focus:ring-purple-500 outline-none dark:text-white"
                  />
                </div>
              </>
            )}

            {/* 에러 메시지 */}
            {error && (
              <p className="text-red-500 text-xs text-center font-medium bg-red-50 dark:bg-red-900/20 py-2 rounded-lg break-keep">
                {error}
              </p>
            )}

            {/* 아이디 저장 */}
            {isLoginMode && (
              <div className="flex items-center gap-2 mt-2">
                <div className="relative flex items-center">
                  <input type="checkbox" id="saveId" className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-300 checked:bg-purple-600 checked:border-purple-600 transition-all" />
                  <Check size={10} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" />
                </div>
                <label htmlFor="saveId" className="text-xs text-gray-500 cursor-pointer select-none">아이디 저장</label>
              </div>
            )}

            {/* 로그인/가입 버튼 */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 mt-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-purple-200 dark:shadow-none transform active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? '처리 중...' : (isLoginMode ? '로그인' : '회원가입')}
            </button>
          </form>

          {/* 하단 영역 */}
          <div className="mt-8 text-center">
            
            {/* 🚀 소셜 로그인 구분선 */}
            <div className="relative flex items-center justify-center mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
              </div>
              <div className="relative bg-white/0 dark:bg-gray-800/0 px-2">
                <span className="text-[10px] font-bold text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded-full">
                  간편로그인으로 3초만에 시작하기 🚀
                </span>
              </div>
            </div>

            {/* 🚀 소셜 아이콘 버튼들 */}
            <div className="flex justify-center gap-4 mb-8">
              {/* Google */}
              <button 
                type="button"
                onClick={() => handleSocialLogin('Google')}
                className="w-10 h-10 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 transition-transform hover:scale-110"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </button>

              {/* Kakao (Yellow) */}
              <button 
                type="button"
                onClick={() => handleSocialLogin('Kakao')}
                className="w-10 h-10 rounded-full bg-[#FEE500] shadow-sm flex items-center justify-center hover:opacity-90 transition-transform hover:scale-110 text-[#391B1B]"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054-.188.702-.682 2.545-.78 2.94-.122.49.178.483.376.351.279-.186 2.946-2.003 4.13-2.809.664.095 1.346.145 2.04.145 4.97 0 9-3.185 9-7.115S16.97 3 12 3z"/>
                </svg>
              </button>

              {/* Naver (Green) */}
              <button 
                type="button"
                onClick={() => handleSocialLogin('Naver')}
                className="w-10 h-10 rounded-full bg-[#03C75A] shadow-sm flex items-center justify-center hover:opacity-90 transition-transform hover:scale-110 text-white"
              >
                <span className="font-bold text-xs font-sans">N</span>
              </button>
            </div>

            {/* 모드 전환 */}
            <div className="text-xs text-gray-500">
              {isLoginMode ? '아직 계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
              <button 
                onClick={() => {
                  setIsLoginMode(!isLoginMode);
                  setError(null);
                  setFormData(prev => ({...prev, password: '', confirmPassword: ''}));
                }}
                className="font-bold text-purple-600 dark:text-purple-400 hover:underline underline-offset-2"
              >
                {isLoginMode ? '회원가입' : '로그인'}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}