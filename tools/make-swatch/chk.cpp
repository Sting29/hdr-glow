#include <cstdio>
#include <cstdlib>
#include <vector>
#include <cstdint>
#include <cmath>
#include "ultrahdr_api.h"
int main(int argc,char**argv){
  FILE*f=fopen(argv[1],"rb");fseek(f,0,SEEK_END);long n=ftell(f);fseek(f,0,SEEK_SET);std::vector<char> b(n);if(fread(b.data(),1,n,f)!=(size_t)n)return 2;fclose(f);
  printf("is_uhdr: %d\n", is_uhdr_image(b.data(), (int)n));
  uhdr_codec_private_t* d=uhdr_create_decoder();
  uhdr_compressed_image_t c{}; c.data=b.data(); c.data_sz=c.capacity=n;
  uhdr_dec_set_image(d,&c);
  uhdr_dec_set_out_color_transfer(d,UHDR_CT_LINEAR);
  uhdr_dec_set_out_img_format(d,UHDR_IMG_FMT_64bppRGBAHalfFloat);
  auto r=uhdr_dec_probe(d); printf("probe %d\n",r.error_code);
  auto* m=uhdr_dec_get_gainmap_metadata(d);
  printf("meta max %f min %f gamma %f off %f/%f cap %f..%f\n",m->max_content_boost[0],m->min_content_boost[0],m->gamma[0],m->offset_sdr[0],m->offset_hdr[0],m->hdr_capacity_min,m->hdr_capacity_max);
  r=uhdr_decode(d); printf("decode %d %s\n",r.error_code,r.has_detail?r.detail:"");
  auto* img=uhdr_get_decoded_image(d);
  uint16_t* p=(uint16_t*)img->planes[0];
  auto h2f=[](uint16_t h){int s=h>>15,e=(h>>10)&31,m=h&1023;float v=e==0?ldexpf(m,-24):ldexpf(1024+m,e-25);return s?-v:v;};
  printf("first pixel RGBA: %f %f %f %f\n",h2f(p[0]),h2f(p[1]),h2f(p[2]),h2f(p[3]));
}
