#include <cstdio>
#include <cstdlib>
#include <vector>
#include "ultrahdr_api.h"
static std::vector<char> rd(const char* p){FILE*f=fopen(p,"rb");fseek(f,0,SEEK_END);long n=ftell(f);fseek(f,0,SEEK_SET);std::vector<char> b(n);fread(b.data(),1,n,f);fclose(f);return b;}
int main(int argc,char**argv){
  float boost=atof(argv[3]);
  auto base=rd(argv[1]); auto gain=rd(argv[2]);
  uhdr_compressed_image_t b{}; b.data=base.data(); b.data_sz=b.capacity=base.size();
  b.cg=UHDR_CG_BT_709; b.ct=UHDR_CT_SRGB; b.range=UHDR_CR_FULL_RANGE;
  uhdr_compressed_image_t g{}; g.data=gain.data(); g.data_sz=g.capacity=gain.size();
  g.cg=UHDR_CG_UNSPECIFIED; g.ct=UHDR_CT_UNSPECIFIED; g.range=UHDR_CR_UNSPECIFIED;
  uhdr_gainmap_metadata_t m{};
  for(int i=0;i<3;i++){m.max_content_boost[i]=boost;m.min_content_boost[i]=1.0f;m.gamma[i]=1.0f;m.offset_sdr[i]=0.0f;m.offset_hdr[i]=0.0f;}
  m.hdr_capacity_min=1.0f; m.hdr_capacity_max=boost; m.use_base_cg=1;
  uhdr_codec_private_t* e=uhdr_create_encoder();
  auto chk=[&](uhdr_error_info_t r,const char*w){ if(r.error_code!=UHDR_CODEC_OK){fprintf(stderr,"%s failed: %s\n",w,r.has_detail?r.detail:"");exit(1);} };
  chk(uhdr_enc_set_compressed_image(e,&b,UHDR_BASE_IMG),"set base");
  chk(uhdr_enc_set_gainmap_image(e,&g,&m),"set gain");
  chk(uhdr_encode(e),"encode");
  auto* out=uhdr_get_encoded_stream(e);
  FILE*f=fopen(argv[4],"wb");fwrite(out->data,1,out->data_sz,f);fclose(f);
  printf("wrote %zu bytes\n",out->data_sz);
  uhdr_release_encoder(e);
}
